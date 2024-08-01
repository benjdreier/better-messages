// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// No Node.js APIs are available in this process because
// `nodeIntegration` is turned off. Use `preload.js` to
// selectively enable features needed in the rendering
// process.

const { ipcRenderer, clipboard } = require('electron');
const bootstrap = require('bootstrap')
let $ = require('jquery');

$(refreshDb);
$('#file-load-button').on('click', loadTextDb);
$('#refresh-button').on('click', refreshDb);

function copyText(text) {
    console.log("text to be copied:");
    console.log(text);
}


async function loadTextDb() {
    console.log("trying");
    
    let fileExists = await ipcRenderer.invoke('app:load-messages-file');
    console.log(fileExists);
    if(fileExists) {
        $('#file-loaded').text("Loaded!");
    }
}

function refreshDb() {    
    ipcRenderer.invoke('app:requery-db');
}

function weirdDateToEpoch(weirdDate) {
    let epoch = (weirdDate / 1000000000 + 978307200) * 1000; //978307170;
    return (new Date(epoch)).toLocaleString();
}

ipcRenderer.on('app:render-message-list', (_event, data)=>{
    $('#message-list').empty();
    $.each(data, (i, row) => {
        console.log(row);
        let senderName = 
            row.display_name 
            || row.contacts.reduce((prev, curr) => prev + (curr.firstName || curr.phoneNumbers[0]) + ", ", "") 
            || row.numbers
        // var list_el = document.createElement("a");
        // list_el.setAttribute("class", "list-group-item list-group-item-action flex-column align-items-start");
        // list_el.textContent = row.text;
        var list_el = `
        <div class="list-box">
            <a class="card list-group-item list-group-item-action flex-column align-items-start message-row"
                id="message-row-${i}"
                href="imessage://${row.numbers.includes(",") ? "": row.numbers}"
            >
                <div class="message-box">
                    <div class="message-content">
                    ${senderName}<br>
                    ${weirdDateToEpoch(row.date)}<br>
                    ${row.text}
                    </div>
                </div>
            </a>
            <div class="check-box"
                 id="check-box-${i}"
            >
                <img src="./assets/check-mark.webp" height=40>
            </div>
        </div>
        `

        $('#message-list').append(list_el);
        $(`#message-row-${i}`).on('click', () => {
            let split = row.numbers.replaceAll(",", "\n");
            clipboard.writeText(split);
        })

        $(`#check-box-${i}`).on('click', () => {
            // Mark this message as dismissed
            ipcRenderer.invoke('app:mark-dismissed', row);
        })
    })
})