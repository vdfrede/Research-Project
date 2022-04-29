// const { Client } = require("@notionhq/client")
// const dotenv = require("dotenv")
// const { Octokit } = require("octokit")
// //Read up on this line below. 
// const _ = require("lodash")

// dotenv.config()
// const octokit = new Octokit({ auth: process.env.GITHUB_KEY })
// const notion = new Client({ auth: process.env.NOTION_KEY })

// const databaseId = process.env.NOTION_DATABASE_ID
// const OPERATION_BATCH_SIZE = 10

// Get the GitHub username input form
const gitHubForm = document.getElementById('gitHubForm');
let files = new Map();
// Listen for submissions on GitHub username input form
gitHubForm.addEventListener('submit', (e) => {
    
    // Prevent default form submission action
    e.preventDefault();

    // Get the GitHub username input field on the DOM
    let usernameInput = document.getElementById('usernameInput');

    // Get the value of the GitHub username input field
    let gitHubUsername = usernameInput.value;          
    
    // Run GitHub API function, passing in the GitHub username
    requestUserRepos(gitHubUsername);
    
   
    console.log(files)

})

function requestUserRepos(username){

    // Create new XMLHttpRequest object
    const xhr = new XMLHttpRequest();
    
    // GitHub endpoint, dynamically passing in specified username
    const url =`https://api.github.com/repos/vdfrede/api_test/contents`;
    // Open a new connection, using a GET request via URL endpoint
    // Providing 3 arguments (GET/POST, The URL, Async True/False)
    xhr.open('GET', url, true);
    
    // When request is received
    // Process it here
    xhr.onload = function () {

    
        // Parse API data into JSON
        const data = JSON.parse(this.response);

        
        // Loop over each object in data array
        for (let i in data) {
            let file = {
                fileName: data[i].name,
                size: data[i].size,
                SHA: data[i].sha,
                totalComits: 0,
                comitter: "",
                additions: 0,
                deletions: 0,
            }
            files.set(file.fileName, file)
            // Get the ul with id of of userRepos
            let ul = document.getElementById('userRepos');
    
            // Create variable that will create li's to be added to ul
            let li = document.createElement('li');
            
            // Add Bootstrap list item class to each li
            li.classList.add('list-group-item')
        
            // Create the html markup for each li
            li.innerHTML = (`
                <p><strong>File:</strong> ${data[i].name}</p>
                <p><strong>LOC:</strong> ${data[i].size}</p>
                <p><strong>SHA:</strong> ${data[i].sha}</p>
            `);
            
            // Append each li to the ul
            ul.appendChild(li);
        
        }
        files.forEach(file => {
            tester(file);
            })


    }
    
    // Send the request to the server
    xhr.send();
   
    
}

function tester(file){
    const xhr2 = new XMLHttpRequest();
    const url2 =`https://api.github.com/repos/vdfrede/api_test/commits/${file.SHA}`;
    xhr2.open('GET', url2, true);
    let auth = `token ${process.env.GITHUB_KEY}`;
    xhr2.setRequestHeader('Authorization', auth)
    xhr2.onload = function (){
        const data2 = JSON.parse(this.response);

            file.comitter = "Emilie"
            file.totalComits = file.totalComits + 1
            file.additions = data2.additions
            file.deletions = data2.deletions
            files.set(file.fileName, file)
            console.log(data2.name)
        
    }
xhr2.send();
console.log(files)

}



