const dotenv = require("dotenv");
const { Octokit } = require("octokit");
const { Client } = require("@notionhq/client");
const _ = require("lodash");
const fs = require("fs");
const { last } = require("lodash");

dotenv.config();
const octokit = new Octokit({ auth: process.env.GITHUB_KEY });
const notion = new Client({ auth: process.env.NOTION_KEY });
const databaseId = process.env.NOTION_DATABASE_ID;
const OPERATION_BATCH_SIZE = 10;

const commits = new Map();
let id = 0;

syncNotionDatabaseWithGitHub();

async function syncNotionDatabaseWithGitHub() {
  let test = await fs.readFileSync(
    "lastUpdated.txt",
    function (err, data) {
      if (err) {
        return console.error(err);
      }
      const lastUpdated = data.toString();

      return lastUpdated;
    }
  );

  const commits = await getCommitData(test);
  fs.writeFileSync("lastUpdated.txt", dateAsString(), function (err) {
    if (err) {
      return console.error(err);
    }
  });

  console.log(`Fetched ${commits.size} files from GitHub repository.`);
  const { pagesToCreate } = getNotionOperations(commits.values());

  // Create pages for new files.
  console.log(`\n${pagesToCreate.length} new files to add to Notion.`);
  await createPages(pagesToCreate);

  // Success!
  console.log("\n✅ Notion database is synced with GitHub.");
}

function dateAsString() {
  var today = new Date();
  var date =
    today.getFullYear() + "-" + (today.getMonth() + 1) + "-" + today.getDate();
  var time =
    today.getHours() + ":" + today.getMinutes() + ":" + today.getSeconds();
  var dateTime = date + "T" + time;
  return dateTime;
}

/**
 * @param {Array<{ number: number, title: string, state: "open" | "closed", comment_count: number, url: string }>} files
 * @returns {{
 *   pagesToCreate: Array<{ filename: string, dir: string, sha: string, date: Date, additions: number, deletions: number, number: number, subfolders: string}>
 * }}
 */
function getNotionOperations(files) {
  const pagesToCreate = [];
  for (const file of files) {
    pagesToCreate.push(file);
  }
  return { pagesToCreate };
}

/**
 * Creates new pages in Notion.
 * @param {Array<{ filename: string, dir: string, sha: string, date: Date, additions: number, deletions: number, number: number, committer: string, subfolders: string  }>} pagesToCreate
 */
async function createPages(pagesToCreate) {
  const pagesToCreateChunks = _.chunk(pagesToCreate, OPERATION_BATCH_SIZE);
  for (const pagesToCreateBatch of pagesToCreateChunks) {
    await Promise.all(
      pagesToCreateBatch.map((element) =>
        notion.pages.create({
          parent: { database_id: databaseId },
          properties: getPropertiesFromFile(element),
        })
      )
    );
    console.log(`Completed batch size: ${pagesToCreateBatch.length}`);
  }
}

/**
 * Returns the GitHub file to conform to this database's schema properties.
 *
 * @param {{ filename: string, dir: string, sha: string, date: Date, additions: number, deletions: number, number: number, committer: string, subfolders: string }} singleCommit
 */
function getPropertiesFromFile(singleCommit) {
  const {
    filename,
    dir,
    sha,
    date,
    additions,
    deletions,
    subfolders,
    number,
    committer,
  } = singleCommit;
  return {
    Name: {
      title: [{ type: "text", text: { content: filename } }],
    },
    Directory: {
      rich_text: [{ type: "text", text: { content: dir } }],
    },
    sha: {
      rich_text: [{ type: "text", text: { content: sha } }],
    },
    Date: {
      date: {
        start: date,
        end: date,
      },
    },
    Additions: {
      number: additions,
    },
    Deletions: {
      number: deletions,
    },
    Subfolders: {
      rich_text: [{ type: "text", text: { content: subfolders } }],
    },
    Number: {
      number,
    },
    Committer: {
      rich_text: [{ type: "text", text: { content: committer } }],
    },
  };
}

async function getCommitData(lastUpdated) {
  const iterator = octokit.paginate.iterator(
    `GET /repos/${process.env.GITHUB_REPO_OWNER}/${process.env.GITHUB_REPO_NAME}/commits`,
    {
      owner: process.env.GITHUB_REPO_OWNER,
      repo: process.env.GITHUB_REPO_NAME,
      state: "all",
      per_page: 100,
      since: lastUpdated,
    }
  );
  for await (const { data } of iterator) {
    for (const commit of data) {
      let holder = await getCommit(commit);
      if (holder != undefined) {
        console.log(commit);
        commits.set(commit.sha + holder.filename, holder);
      }
    }
  }

  return commits;
}

async function getCommit(commit) {
  const iterator = octokit.paginate.iterator(
    `GET /repos/${process.env.GITHUB_REPO_OWNER}/${process.env.GITHUB_REPO_NAME}/commits/${commit.sha}`,
    {
      owner: process.env.GITHUB_REPO_OWNER,
      repo: process.env.GITHUB_REPO_NAME,
      state: "all",
      per_page: 100,
    }
  );

  for await (const { data } of iterator) {
    for (const com of data.files) {
      let dir = [];
      if (com.filename.includes("/") && com.filename.includes("src")) {
        dir = com.filename.split("/");
        let subfolders = dir.slice(1, -1).join("/");

        let singleCommit = {
          dir: dir[0],
          subfolders: subfolders,
          filename: dir[dir.length - 1],
          sha: commit.sha,
          date: commit.commit.committer.date,
          additions: com.additions,
          deletions: Math.abs(com.deletions),
          number: id,
          committer: commit.commit.committer.name,
        };
        id = id + 1;
        return singleCommit;
      }
    }
  }
}
