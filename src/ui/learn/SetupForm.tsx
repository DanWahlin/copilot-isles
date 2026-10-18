import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  BRANCH_INPUT_MAX,
  cleanModelName,
  COURSE_BRANCH,
  COURSE_ISSUE,
  COURSE_ISSUE_TITLE,
  formatKeys,
  ISSUE_INPUT_MAX,
  MODEL_NAME_MAX,
  modelLabel,
  OS_IDS,
  OS_NAMES,
  parseBranch,
  parseIssue,
  type ModelPick,
  type OsId,
  type SetupData,
  type SetupKind,
} from '../../learn/setup';
import type { LearnStore, SetupFrom } from '../../learn/store';
import { COURSE } from '../../course/catalog';
import { fill } from '../../course/fill';
import { Rich as RichText } from '../components/Rich';
import { useFormKeys } from './ForkForm';

/** The forms' words: the course's (course.json `setup`). */
// Only a course with `setup` asks for these forms (its scripts' `askSetup` steps).
const copy = () => COURSE.setup!;
const values = () => ({ issue: COURSE_ISSUE, issueTitle: COURSE_ISSUE_TITLE, branch: COURSE_BRANCH });

/** The course's copy with {issue}, {issueTitle} and {branch} filled. */
function Rich({ text }: { text: string }) {
  return <RichText text={text} values={values()} />;
}

/** A form's title: the first time it asks, or a change from the Logbook. */
const title = (kind: SetupKind, from: SetupFrom) =>
  from === 'logbook' ? copy()[kind].title : <Rich text={copy()[kind].ask} />;

const PRIVACY = 'It stays on this device, in your save. The game doesn’t send it anywhere.';

interface FormProps {
  store: LearnStore;
  from: SetupFrom;
  setup: SetupData;
  detected: OsId;
}

/**
 * The small "Your setup" forms (src/learn/setup.ts), in the fork form's style: each one is optional
 * (Skip for now, or Esc, or B on a gamepad), and changeable later from the Logbook's Your setup card.
 */
export function SetupForm(p: FormProps & { kind: SetupKind }) {
  if (p.kind === 'os') return <OsForm {...p} />;
  if (p.kind === 'issue') return <IssueForm {...p} />;
  if (p.kind === 'branch') return <BranchForm {...p} />;
  return <ModelForm {...p} />;
}

/** The dialog around each form: kicker, title, intro, the fields, what it's used for, and the buttons. */
function Shell({
  store,
  from,
  kind,
  title,
  intro,
  uses,
  privacy = PRIVACY,
  save,
  canSave,
  saveLabel,
  skipLabel,
  forget,
  onEnterInChoice,
  children,
}: {
  store: LearnStore;
  from: SetupFrom;
  kind: SetupKind;
  title: ReactNode;
  intro: ReactNode;
  uses: ReactNode;
  privacy?: string;
  save: () => void;
  canSave: boolean;
  saveLabel: string;
  skipLabel?: string;
  /** Shown from the Logbook once there's something to forget. */
  forget: boolean;
  onEnterInChoice?: boolean;
  children: (ids: string) => ReactNode;
}) {
  const ids = useId();
  const skip = () => store.skipSetup();
  useFormKeys(save, skip);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save();
  };
  // Enter on a radio choice saves too (browsers only submit from text fields).
  const keyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    if (!onEnterInChoice || e.key !== 'Enter') return;
    if ((e.target as HTMLInputElement).type === 'radio') {
      e.preventDefault();
      save();
    }
  };
  return (
    <div className="ci-learn-backdrop">
      <form
        className="ci-fork ci-setup"
        data-kind={kind}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${ids}-title`}
        aria-describedby={`${ids}-intro ${ids}-privacy`}
        onSubmit={submit}
        onKeyDown={keyDown}
        noValidate
      >
        <p className="ci-page-kicker">{copy()[kind].label}</p>
        <h2 id={`${ids}-title`}>{title}</h2>
        <p id={`${ids}-intro`} className="ci-fork-intro">
          {intro}
        </p>
        {children(ids)}
        <p className="ci-fork-uses">{uses}</p>
        <p id={`${ids}-privacy`} className="ci-fork-privacy">
          {privacy}
        </p>
        <div className="ci-fork-actions">
          <button type="submit" className="ci-btn primary" aria-disabled={!canSave}>
            {saveLabel} <kbd>↵</kbd>
          </button>
          <button type="button" className="ci-btn ghost" onClick={skip}>
            {skipLabel ?? (from === 'logbook' ? 'Cancel' : 'Skip for now')} <kbd>Esc</kbd>
          </button>
          {from === 'logbook' && forget && (
            <button type="button" className="ci-btn ghost" onClick={() => store.saveSetup({ [kind]: null })}>
              Forget it
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

/** Focuses (and selects) the field once the form opens. */
function useFocus<T extends HTMLElement>(): RefObject<T | null> {
  const ref = useRef<T>(null);
  useEffect(() => {
    ref.current?.focus();
    if (ref.current instanceof HTMLInputElement && ref.current.type === 'text') ref.current.select();
  }, []);
  return ref;
}

function OsForm({ store, from, setup, detected }: FormProps) {
  const [os, setOs] = useState<OsId>(setup.os ?? detected);
  const first = useFocus<HTMLInputElement>();
  const save = () => store.saveSetup({ os });
  return (
    <Shell
      store={store}
      from={from}
      kind="os"
      title={title('os', from)}
      intro={<Rich text={copy().os.intro} />}
      uses={copy().os.uses}
      privacy={`It stays on this device, in your save. To guess, the game only asks your browser which system it’s on (it says ${OS_NAMES[detected]}).`}
      save={save}
      canSave
      saveLabel={`Use ${OS_NAMES[os]}`}
      skipLabel={from === 'logbook' ? undefined : `Skip (keep ${OS_NAMES[setup.os ?? detected]})`}
      forget={setup.os !== null}
      onEnterInChoice
    >
      {(ids) => (
        <>
          <fieldset className="ci-setup-choices">
            <legend className="ci-fork-label">{copy().os.label}</legend>
            {OS_IDS.map((id) => (
              <label key={id} className={`ci-setup-choice${os === id ? ' on' : ''}`}>
                <input
                  ref={id === os ? first : undefined}
                  type="radio"
                  name={`${ids}-os`}
                  value={id}
                  checked={os === id}
                  onChange={() => setOs(id)}
                />
                <span>{OS_NAMES[id]}</span>
                {id === detected && <small>your browser’s guess</small>}
              </label>
            ))}
          </fieldset>
          <div className="ci-fork-status" aria-live="polite">
            <p className="ci-fork-read">
              <span aria-hidden>✓</span> {fill(copy().os.read, { os: OS_NAMES[os] })}{' '}
              <kbd>{formatKeys(copy().os.shortcut, os)}</kbd>
            </p>
          </div>
        </>
      )}
    </Shell>
  );
}

function IssueForm({ store, from, setup }: FormProps) {
  const [text, setText] = useState(String(setup.issue ?? COURSE_ISSUE));
  const [tried, setTried] = useState(false);
  const input = useFocus<HTMLInputElement>();
  const parsed = text.trim() ? parseIssue(text) : null;
  const ok = parsed?.ok ? parsed.value : null;
  const error = parsed && !parsed.ok && tried ? parsed.error : null;
  const save = () => {
    setTried(true);
    if (ok !== null) store.saveSetup({ issue: ok });
    else input.current?.focus();
  };
  return (
    <Shell
      store={store}
      from={from}
      kind="issue"
      title={title('issue', from)}
      intro={<Rich text={copy().issue.intro} />}
      uses={copy().issue.uses}
      save={save}
      canSave={ok !== null}
      saveLabel={ok !== null ? `Use #${ok}` : 'Save'}
      skipLabel={from === 'logbook' ? undefined : `Skip (keep #${setup.issue ?? COURSE_ISSUE})`}
      forget={setup.issue !== null}
    >
      {(ids) => (
        <>
          <label className="ci-fork-label" htmlFor={`${ids}-input`}>
            {copy().issue.field}
          </label>
          <input
            id={`${ids}-input`}
            ref={input}
            className="ci-fork-input ci-setup-short"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            maxLength={ISSUE_INPUT_MAX}
            placeholder={`#${COURSE_ISSUE}`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => text.trim() && setTried(true)}
            aria-invalid={!!error}
            aria-describedby={`${ids}-status`}
          />
          <div id={`${ids}-status`} className="ci-fork-status" aria-live="polite">
            {ok !== null && (
              <p className="ci-fork-read">
                <span aria-hidden>✓</span> {copy().issue.read}{' '}
                <strong>
                  #{ok} {COURSE_ISSUE_TITLE}
                </strong>
              </p>
            )}
            {error && <p className="ci-fork-error">{error}</p>}
            {!parsed && (
              <p className="ci-fork-hint">
                <Rich text={copy().issue.hint!} />
              </p>
            )}
          </div>
        </>
      )}
    </Shell>
  );
}

function BranchForm({ store, from, setup }: FormProps) {
  const [text, setText] = useState(setup.branch ?? COURSE_BRANCH);
  const [tried, setTried] = useState(false);
  const input = useFocus<HTMLInputElement>();
  const parsed = text.trim() ? parseBranch(text) : null;
  const ok = parsed?.ok ? parsed.value : null;
  const error = parsed && !parsed.ok && tried ? parsed.error : null;
  const save = () => {
    setTried(true);
    if (ok !== null) store.saveSetup({ branch: ok });
    else input.current?.focus();
  };
  return (
    <Shell
      store={store}
      from={from}
      kind="branch"
      title={title('branch', from)}
      intro={<Rich text={copy().branch.intro} />}
      uses={copy().branch.uses}
      save={save}
      canSave={ok !== null}
      saveLabel={ok === COURSE_BRANCH ? copy().branch.match : 'Save'}
      forget={setup.branch !== null}
    >
      {(ids) => (
        <>
          <label className="ci-fork-label" htmlFor={`${ids}-input`}>
            {copy().branch.field}
          </label>
          <input
            id={`${ids}-input`}
            ref={input}
            className="ci-fork-input"
            type="text"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={BRANCH_INPUT_MAX}
            placeholder={COURSE_BRANCH}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => text.trim() && setTried(true)}
            aria-invalid={!!error}
            aria-describedby={`${ids}-status`}
          />
          <div id={`${ids}-status`} className="ci-fork-status" aria-live="polite">
            {ok !== null && (
              <p className="ci-fork-read">
                <span aria-hidden>✓</span> {copy().branch.read} <strong>{ok}</strong>
              </p>
            )}
            {error && <p className="ci-fork-error">{error}</p>}
            {!parsed && (
              <p className="ci-fork-hint">
                <Rich text={copy().branch.hint!} />
              </p>
            )}
          </div>
        </>
      )}
    </Shell>
  );
}

const MODEL_PICKS: readonly ModelPick['pick'][] = ['auto', 'current', 'other'];

function ModelForm({ store, from, setup }: FormProps) {
  const [pick, setPick] = useState<ModelPick['pick']>(setup.model?.pick ?? 'auto');
  const [name, setName] = useState(setup.model?.pick === 'other' ? (setup.model.name ?? '') : '');
  const first = useFocus<HTMLInputElement>();
  const chosen: ModelPick = pick === 'other' ? { pick, name: cleanModelName(name) } : { pick };
  const save = () => store.saveSetup({ model: chosen });
  return (
    <Shell
      store={store}
      from={from}
      kind="model"
      title={title('model', from)}
      intro={<Rich text={copy().model.intro} />}
      uses={copy().model.uses}
      save={save}
      canSave
      saveLabel="Save"
      forget={setup.model !== null}
      onEnterInChoice
    >
      {(ids) => (
        <>
          <fieldset className="ci-setup-choices">
            <legend className="ci-fork-label">{copy().model.field}</legend>
            {MODEL_PICKS.map((pk) => ({ pick: pk, ...copy().model.choices[pk] })).map((c) => (
              <label key={c.pick} className={`ci-setup-choice${pick === c.pick ? ' on' : ''}`}>
                <input
                  ref={c.pick === pick ? first : undefined}
                  type="radio"
                  name={`${ids}-model`}
                  value={c.pick}
                  checked={pick === c.pick}
                  onChange={() => setPick(c.pick)}
                />
                <span>{c.label}</span>
                <small>{c.note}</small>
              </label>
            ))}
          </fieldset>
          {pick === 'other' && (
            <>
              <label className="ci-fork-label" htmlFor={`${ids}-name`}>
                {copy().model.name}
              </label>
              <input
                id={`${ids}-name`}
                className="ci-fork-input"
                type="text"
                autoComplete="off"
                spellCheck={false}
                maxLength={MODEL_NAME_MAX * 2}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </>
          )}
          <div className="ci-fork-status" aria-live="polite">
            <p className="ci-fork-read">
              <span aria-hidden>✓</span> {copy().model.read} <strong>{modelLabel(chosen)}</strong>
            </p>
          </div>
        </>
      )}
    </Shell>
  );
}
