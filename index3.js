const dotenv = require("dotenv");
const { Octokit } = require("octokit");
const { Client } = require("@notionhq/client");
// //Read up on this line below.
const _ = require("lodash");
const { add } = require("lodash");

dotenv.config();
const octokit = new Octokit({ auth: process.env.GITHUB_KEY });
const notion = new Client({ auth: process.env.NOTION_KEY });
const databaseId = process.env.NOTION_DATABASE_ID;
const OPERATION_BATCH_SIZE = 10;

/* Local map to store  GitHub file ID to its Notion pageId.
 * { [fileId: string]: string }
 */
const gitHubFilesIdToNotionPageId = {};
const commits = new Map();
let id = 0;

setInitialGitHubToNotionIdMap().then(syncNotionDatabaseWithGitHub);

/**
 * Get and set the initial data store with files currently in the database.
 */
async function setInitialGitHubToNotionIdMap() {
  const currentFile = await getFilesFromNotionDatabase();
  for (const { pageId, fileNumber } of currentFile) {
    gitHubFilesIdToNotionPageId[fileNumber] = pageId
  }
}

async function syncNotionDatabaseWithGitHub() {
  // Get all files currently in the provided GitHub repository.
  console.log("\nFetching files from Notion DB...");
  const commits = await getCommitData();

  console.log(`Fetched ${commits.size} files from GitHub repository.`);

  // Group files into those that need to be created or updated in the Notion database.
  const { pagesToCreate, pagesToUpdate } = getNotionOperations(commits);


  // Create pages for new files.
  console.log(`\n${pagesToCreate.length} new files to add to Notion.`);
  await createPages(pagesToCreate);

  // Updates pages for existing files.
  console.log(`\n${pagesToUpdate.length} files to update in Notion.`);
  await updatePages(pagesToUpdate);

  // Success!
  console.log("\n✅ Notion database is synced with GitHub.");
}

/**
 * Gets pages from the Notion database.
 *
 * @returns {Promise<Array<{ pageId: string, fileNumber: number }>>}
 */
async function getFilesFromNotionDatabase() {
  const pages = [];
  let cursor = undefined;
  while (true) {
    const { results, next_cursor } = await notion.databases.query({
      database_id: databaseId,
      start_cursor: cursor,
    });
    pages.push(...results);
    if (!next_cursor) {
      break;
    }
    cursor = next_cursor;
  }
  console.log(`${pages.length} files successfully fetched.`);
  return pages.map((page) => {
    return {
      pageId: page.id,
      fileNumber: page.properties["Number"].number,
    };
  });
}
/**
 * Determines which files already exist in the Notion database.
 *
 * @param {Array<{ number: number, title: string, state: "open" | "closed", comment_count: number, url: string }>} files
 * @returns {{
 *   pagesToCreate: Array<{ filename: string, dir: string, sha: string, date: Date, additions: number, deletions: number, number: number}>
 *   pagesToUpdate: Array<{ pageId: string, filename: string, dir: string, sha: string, date: Date, additions: number, deletions: number, number: number}>
 * }}
 */
function getNotionOperations(files) {
  const pagesToCreate = [];
  const pagesToUpdate = [];
  for (const file of files) {
    const pageId = gitHubFilesIdToNotionPageId[file.number];

    if (pageId) {
      pagesToUpdate.push({
        ...file,
        pageId,
      });
    } else {
      pagesToCreate.push(file);
    }
  }
  return { pagesToCreate, pagesToUpdate };
}

/**
 * Creates new pages in Notion.
 *
 * https://developers.notion.com/reference/post-page
 *
 * @param {Array<{ pageId: string,filename: string, dir: string, sha: string, date: Date, additions: number, deletions: number, number: number }>} pagesToCreate
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
    )
    console.log(`Completed batch size: ${pagesToCreateBatch.length}`);
  }
}

/**
 * Updates provided pages in Notion.
 *
 * https://developers.notion.com/reference/patch-page
 *
 * @param {Array<{ pageId: string,filename:string, dir:string, sha:string, date:Date, additions:number, deletions:number, number: number }>} pagesToUpdate
 */
async function updatePages(pagesToUpdate) {
  const pagesToUpdateChunks = _.chunk(pagesToUpdate, OPERATION_BATCH_SIZE);
  for (const pagesToUpdateBatch of pagesToUpdateChunks) {
    await Promise.all(
      pagesToUpdateBatch.map(({ pageId, ...element }) =>
        notion.pages.update({
          page_id: pageId,
          properties: getPropertiesFromFile(element),
        })
      )
    )
    console.log(`Completed batch size: ${pagesToUpdateBatch.length}`);
  }
}

//*========================================================================
// Helpers
//*========================================================================

/**
 * Returns the GitHub file to conform to this database's schema properties.
 *
 * @param {{ filename: string, dir: string, sha: string, date: Date, additions: number, deletions: number, number: number }} singleCommit
 */
function getPropertiesFromFile(singleCommit) {
  const { filename, dir,  sha, date, additions, deletions, number } = singleCommit
  console.log(singleCommit)
  return {
    Name: {
      title: [{ type: "text", text: { content: filename } }],
    },
    "Directory": {
      rich_text: [{ type: "text", text: { content: dir } }],
    },
    "sha": {
      rich_text: [{ type: "text", text: { content: sha } }],
    },
    "Date": {
      date: {
        start: date,
        end: date,
     },
    },
    "Additions": {
      number: additions,
    },
    "Deletions": {
      number: deletions,
    },  
     "Number": {
   number,
    }
  }
}

async function getCommitData() {
  const iterator = octokit.paginate.iterator(
    `GET /repos/${process.env.GITHUB_REPO_OWNER}/${process.env.GITHUB_REPO_NAME}/commits`,
    {
      owner: process.env.GITHUB_REPO_OWNER,
      repo: process.env.GITHUB_REPO_NAME,
      state: "all",
      per_page: 100,
    }
  );
  for await (const { data } of iterator) {
    for (const commit of data) {
      let holder = await getCommit(commit);
     if(holder != undefined){
      commits.set(commit.sha + holder.filename, holder);
      //Should be used to go over the list of commits and then look at each commit
    }}
  }

  return commits.values();
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
      if (com.filename.includes("/")) {
         dir = com.filename.split("/");

      } else {
        dir[0] = "Top";
        dir[1] = com.filename;
      }
      let singleCommit = {
        dir: dir[0],
        filename: dir[1],
        sha: commit.sha,
        date: commit.commit.committer.date,
        additions: com.additions,
        deletions: Math.abs(com.deletions),
        number: id
      };
      id = id + 1
      return singleCommit;
   
    }
  }
}
