import {saveCache, restoreCache} from '@actions/cache';
import * as core from '@actions/core';
import * as gh from '@actions/github';
import * as glob from '@actions/glob';
import fs from 'fs';
import * as crypto from 'crypto';

const key = 'sccache';

const cargoLockHash = async (): Promise<string> => {
  const file_to_hash = await globFiles('**/*.lock');
  console.log(file_to_hash);
  const fileBuffer = await fs.promises.readFile(file_to_hash[0]);
  const hash = crypto.createHash('sha256');
  hash.update(fileBuffer);
  return hash.digest('hex');
};

async function globFiles(pattern: string): Promise<string[]> {
  const globber = await glob.create(pattern, {
    followSymbolicLinks: false
  });
  // fs.statSync resolve the symbolic link and returns stat for the
  // file it pointed to, so isFile would make sure the resolved
  // file is actually a regular file.
  return (await globber.glob()).filter(file => fs.statSync(file).isFile());
}

const makeKey = async (): Promise<string> => {
  const hash = await cargoLockHash();
  return `${key}-${hash}`;
};

export const pleaseSave = async () => {
  const path = process.env.SCCACHE_CACHE_DIR;
  console.log(path);
  if (!path) {
    console.log(`no sccache dir found in SCCACHE_CACHE_DIR ${path}`);
    return;
  }
  await saveCache([path], await makeKey());
};

export const pleaseRestore = async () => {
  console.log('restore sccache files');
  const path = process.env.SCCACHE_CACHE_DIR;
  console.log(path);
  if (!path) {
    console.log(`no sccache dir found in SCCACHE_CACHE_DIR ${path}`);
    return;
  }
  // restores anything that matches `sccache` if the exact hash is not found
  await restoreCache([path], await makeKey(), [key]).then(r => {
    if (!r) {
      console.log(`no cache matching "${path}" to restore`);
    }
  });
};

export const deduplicate = async () => {
  console.log('trying to deduplicate cache');
  const token = core.getInput('token', {required: true});
  const octokit = gh.getOctokit(token);

  const res = await octokit.rest.actions
    .deleteActionsCacheByKey({
      owner: gh.context.repo.owner,
      repo: gh.context.repo.repo,
      key: await makeKey()
    })
    .then(() => {
      // TODO: more info
      return 'successfully deleted cache';
    })
    .catch(e => {
      console.log(`catch: ${e}`);
      return 'nothing to delete';
    });

  console.log(`delete cache api response: ${res}`);
};
