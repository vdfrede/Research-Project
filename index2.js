const dotenv = require("dotenv");
const { Octokit } = require("octokit");
// //Read up on this line below.
const _ = require("lodash");

dotenv.config();
const octokit = new Octokit({ auth: process.env.GITHUB_KEY });
const files = new Map();
getGitHubRepository();

async function getGitHubRepository() {
  const iterator = octokit.paginate.iterator(
    "GET /repos/vdfrede/api_test/contents",
    {
      owner: process.env.GITHUB_REPO_OWNER,
      repo: process.env.GITHUB_REPO_NAME,
      state: "all",
      per_page: 100,
    }
  );
  for await (const { data } of iterator) {
    // The console log below is to see everything we are fetching from GitHub
    // console.log(data);
    for (const file of data) {
      if (!files.pull_request && !files.has(file.name)) {
        files.set(file.name, {
          name: file.name,
          size: file.size,
          sha: file.sha,
          totalComits: 0,
          totalAdditions: 0,
          totalDeletions: 0,
          committer: "",
          additions: 0,
          deletions: 0,
        });
      }
    }
  }

  getCommitData();
  //console.log(files)
  return files;
}

async function getCommitData() {
  const iterator = octokit.paginate.iterator(
    `GET /repos/vdfrede/api_test/commits`,
    {
      owner: process.env.GITHUB_REPO_OWNER,
      repo: process.env.GITHUB_REPO_NAME,
      state: "all",
      per_page: 100,
    }
  );
  for await (const { data } of iterator) {
    for (const commit of data) {
      getCommit(commit);
    }
  }
  // console.log(files)
}

async function getCommit(commit) {
  const iterator = octokit.paginate.iterator(
    `GET /repos/vdfrede/api_test/commits/${commit.sha}`,
    {
      owner: process.env.GITHUB_REPO_OWNER,
      repo: process.env.GITHUB_REPO_NAME,
      state: "all",
      per_page: 100,
    }
  );

  for await (const { data } of iterator) {
    for (const com of data.files) {
      console.log(await files.has(com.filename));

      if (files.has(com.filename)) {
        let file = files.get(com.filename);
     
        files.set(file.name, {
          name: file.name,
          author: commit.author.login,
          size: file.size,
          sha: file.sha,
          committer: commit.committer.login,
          totalComits: file.totalComits + 1,
          additions: com.additions,
          totalAdditions: com.additions + file.totalAdditions,
          deletions: com.deletions,
          totalDeletions: com.deletions + file.totalDeletions,
        });
        console.log("file:")
        console.log(files.get(com.filename));
      }
    }
  }
}
