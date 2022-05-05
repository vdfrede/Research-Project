const dotenv = require("dotenv")
const { Octokit } = require("octokit")
const { Client } = require("@notionhq/client")
// //Read up on this line below.
const _ = require("lodash")

dotenv.config();
const octokit = new Octokit({ auth: process.env.GITHUB_KEY })
const notion = new Client({ auth: process.env.NOTION_KEY })
const databaseId = process.env.NOTION_DATABASE_ID
const OPERATION_BATCH_SIZE = 10


/* Local map to store  GitHub file ID to its Notion pageId.
* { [fileId: string]: string }
*/
const gitHubFilesIdToNotionPageId = {}

const files = new Map();
let id = 0;


setInitialGitHubToNotionIdMap().then(syncNotionDatabaseWithGitHub)



/**
 * Get and set the initial data store with files currently in the database.
 */
 async function setInitialGitHubToNotionIdMap() {
  const currentFile = await getFilesFromNotionDatabase()
  for (const { pageId, fileNumber } of currentFile) {
    gitHubFilesIdToNotionPageId[fileNumber] = pageId
  }
}


async function syncNotionDatabaseWithGitHub() {
  // Get all files currently in the provided GitHub repository.
  console.log("\nFetching files from Notion DB...")
  const files = await getGitHubRepository()

  console.log(`Fetched ${files.size} files from GitHub repository.`)

  // Group files into those that need to be created or updated in the Notion database.
  const { pagesToCreate, pagesToUpdate } = getNotionOperations(files)

  // Create pages for new files.
  console.log(`\n${pagesToCreate.length} new files to add to Notion.`)
  await createPages(pagesToCreate)

  // Updates pages for existing files.
  console.log(`\n${pagesToUpdate.length} files to update in Notion.`)
  await updatePages(pagesToUpdate)

  // Success!
  console.log("\n✅ Notion database is synced with GitHub.")
}

/**
 * Gets pages from the Notion database.
 *
 * @returns {Promise<Array<{ pageId: string, fileNumber: number }>>}
 */
 async function getFilesFromNotionDatabase() {
  const pages = []
  let cursor = undefined
  while (true) {
    const { results, next_cursor } = await notion.databases.query({
      database_id: databaseId,
      start_cursor: cursor,
    })
    pages.push(...results)
    if (!next_cursor) {
      break
    }
    cursor = next_cursor
  }
  console.log(`${pages.length} files successfully fetched.`)
  return pages.map(page => {
    return {
      pageId: page.id,
      fileNumber: page.properties["File number"].number,
      
    }
  })
}
/**
 * Determines which files already exist in the Notion database.
 *
 * @param {Array<{ number: number, title: string, state: "open" | "closed", comment_count: number, url: string }>} files
 * @returns {{
 *   pagesToCreate: Array<{ size: number, name: string, sha: string, totalCommits: number, totalAdditions: number, totalDeletions: number, additions: number, deletions: number, committer: string, number: number }>
 *   pagesToUpdate: Array<{ pageId: string, size: number, name: string, sha: string, totalCommits: number, totalAdditions: number, totalDeletions: number, additions: number, deletions: number, committer: string, number: number }} file }>
 * }}
 */
function getNotionOperations(files) {
  const pagesToCreate = []
  const pagesToUpdate = []
  for (const file of files) {
    const pageId = gitHubFilesIdToNotionPageId[file.number]

    if (pageId) {
      pagesToUpdate.push({
        ...file,
        pageId,
      })
    } else {
      pagesToCreate.push(file)
    }
  }
  return { pagesToCreate, pagesToUpdate }
}


/**
 * Creates new pages in Notion.
 *
 * https://developers.notion.com/reference/post-page
 *
 * @param {Array<{ pageId: string, size: number, name: string, sha: string, totalCommits: number, totalAdditions: number, totalDeletions: number, additions: number, deletions: number, committer: string , number: number}} pagesToCreate
 */
 async function createPages(pagesToCreate) {
 
  const pagesToCreateChunks = _.chunk(pagesToCreate, OPERATION_BATCH_SIZE)
  for (const pagesToCreateBatch of pagesToCreateChunks) {
    await Promise.all(
      pagesToCreateBatch.map(file =>
        notion.pages.create({
          parent: { database_id: databaseId },
          properties: getPropertiesFromFile(file),
        })
      )
    )
    console.log(`Completed batch size: ${pagesToCreateBatch.length}`)
  }
}

/**
 * Updates provided pages in Notion.
 *
 * https://developers.notion.com/reference/patch-page
 *
 * @param {Array<{ pageId: string,size: number, name: string, sha: string, totalCommits: number, totalAdditions: number, totalDeletions: number, additions: number, deletions: number, committer: string, number: number }>} pagesToUpdate
 */
 async function updatePages(pagesToUpdate) {
  const pagesToUpdateChunks = _.chunk(pagesToUpdate, OPERATION_BATCH_SIZE)
  for (const pagesToUpdateBatch of pagesToUpdateChunks) {
    await Promise.all(
      pagesToUpdateBatch.map(({ pageId, ...file }) =>
        notion.pages.update({
          page_id: pageId,
          properties: getPropertiesFromFile(file),
        })
      )
    )
    console.log(`Completed batch size: ${pagesToUpdateBatch.length}`)
  }
}




//*========================================================================
// Helpers
//*========================================================================

/**
 * Returns the GitHub file to conform to this database's schema properties.
 *
 * @param {{ size: number, name: string, sha: string, totalCommits: number, totalAdditions: number, totalDeletions: number, additions: number, deletions: number, committer: string, number: number}} file
 */
 function getPropertiesFromFile(file) {
  const {    name, size, sha, totalCommits, totalAdditions, totalDeletions, committer, additions, deletions, number} = file
  console.log(file.name)
  return {
    Name: {
      title: [{ type: "text", text: { content: name } }],
    },
    "Committer": {
      rich_text: [{ type: "text", text: { content: committer } }],
    },
    
   "Size": {
    number: size,
   },
   "sha": {
    rich_text: [{ type: "text", text: { content: sha} }],

   },
   "Total commits": {
  number: totalCommits,
   },
   "Total additions": {
   number:  totalAdditions,
   },
   "Total deletions": {
    number: totalDeletions,
   },
   "Additions": {
    number: additions,
   },
   "Deletions": {
    number: deletions,
   }, 
   "File number": {
     number,
   }
  }
}

// GitHub fetchers


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

    for (const file of data) {
      console.log(file.type)
      if (!files.pull_request && !files.has(file.name) && file.type == "file" )  {
        files.set(file.name, {
          name: file.name,
          size: file.size,
          sha: file.sha,
          totalCommits: 0,
          totalAdditions: 0,
          totalDeletions: 0,
          committer: "",
          additions: 0,
          deletions: 0,
          number: id
        });
        id = id + 1;
      }
    }
  }

  return await (await getCommitData()).values()
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
  

      let file = await getCommit(commit)
      if(file != undefined){
      files.set(file.name, file) 

    }
  }

  return files
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

      if (files.has(com.filename)) {
        let file = files.get(com.filename);

        files.set(file.name, {
          name: file.name,
          author: commit.author.login,
          size: file.size,
          sha: file.sha,
          committer: commit.committer.login,
          totalCommits: file.totalCommits + 1,
          additions: com.additions,
          totalAdditions: com.additions + file.totalAdditions,
          deletions: Math.abs(com.deletions),
          totalDeletions: com.deletions + Math.abs(file.totalDeletions),
          number: file.number
        });
  
      return files.get(file.name)
      }
    }
  }
}}
