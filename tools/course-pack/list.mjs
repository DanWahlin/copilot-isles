#!/usr/bin/env node
/**
 * The course packs the weekly workflows run over (docs/specs/COURSE-PACKS.md §7), as a JSON array of
 * ids for a job matrix. No dependencies, so it runs before `npm ci`.
 *
 *   node tools/course-pack/list.mjs --github   packs whose course.json → source.kind is "github"
 *   node tools/course-pack/list.mjs --models   packs with a models.json (the Model Market's)
 *
 * Writes `courses=<json>` to $GITHUB_OUTPUT when it's set.
 */
import { appendFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', 'courses');
const github = process.argv.includes('--github');
const models = process.argv.includes('--models');
const ids = readdirSync(root)
  .filter((id) => existsSync(join(root, id, 'course.json')))
  .filter((id) => {
    const meta = JSON.parse(readFileSync(join(root, id, 'course.json'), 'utf8'));
    if (github && meta.source?.kind !== 'github') return false;
    if (models && !existsSync(join(root, id, 'models.json'))) return false;
    return true;
  })
  .sort();
console.log(JSON.stringify(ids));
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `courses=${JSON.stringify(ids)}\n`);
