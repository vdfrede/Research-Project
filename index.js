const { Client } = require("@notionhq/client")
const dotenv = require("dotenv")
const { Octokit } = require("octokit")
//Read up on this line below. 
const _ = require("lodash")

dotenv.config()
const octokit = new Octokit({ auth: process.env.GITHUB_KEY })
const notion = new Client({ auth: process.env.NOTION_KEY })

const databaseId = process.env.NOTION_DATABASE_ID
const OPERATION_BATCH_SIZE = 10
