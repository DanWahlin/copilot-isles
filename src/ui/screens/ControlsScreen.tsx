import type { GameBridge } from '../bridge';
import { OverlayShell } from '../components/OverlayShell';

export function ControlsScreen({ bridge }: { bridge: GameBridge }) {
  return (
    <OverlayShell title="Controls" eyebrow="Captain’s reference" onBack={bridge.back} wide>
      <div className="ci-controls-grid">
        <ControlColumn
          title="On foot"
          rows={[
            [['W', 'A', 'S', 'D'], 'Walk'],
            [['Shift'], 'Run'],
            [['Space'], 'Hop'],
            [['Drag mouse'], 'Look around (either button)'],
            [['Mouse wheel'], 'Zoom'],
            [['E'], 'Interact'],
            [['Q'], 'Wingman’s hint'],
            [['M'], 'Chart'],
            [['J'], 'Logbook'],
            [['T'], 'Show / hide tasks'],
            [['N'], 'Mute / unmute'],
            [['Esc'], 'Menu'],
          ]}
        />
        <ControlColumn
          title="Sailing"
          rows={[
            [['W', 'S'], 'Raise / lower sails'],
            [['A', 'D'], 'Helm'],
            [['E'], 'Dock at the pier'],
            [['Space'], 'Sea battle: fire what bears'],
            [['Z', 'C'], 'Fire port / starboard'],
            [['R'], 'Bring her round'],
          ]}
        />
        <ControlColumn
          title="Gamepad"
          rows={[
            [['Left stick'], 'Move / helm'],
            [['Right stick'], 'Look'],
            [['RT'], 'Run'],
            [['A'], 'Interact'],
            [['X'], 'Wingman’s hint'],
            [['Y'], 'Hop / bring her round'],
            [['A', 'LB', 'RB'], 'Sea battle: fire / port / starboard'],
            [['Back'], 'Chart'],
            [['Start'], 'Menu'],
          ]}
        />
      </div>
    </OverlayShell>
  );
}

function ControlColumn({ title, rows }: { title: string; rows: readonly [readonly string[], string][] }) {
  return (
    <section className="ci-control-column ci-settings-group">
      <h3 className="ci-settings-title">{title}</h3>
      <div className="ci-settings-body">
        {rows.map(([keys, action]) => (
          <div key={action} className="ci-control-row">
            <span>
              {keys.map((key) => (
                <kbd key={key}>{key}</kbd>
              ))}
            </span>
            <p>{action}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
