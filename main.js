// Modules to control application life and create native browser window
const {app, BrowserWindow, ipcMain} = require('electron')
const path = require('path')
let fs = require('fs')
const homedir = require('os').homedir();
const sqlite3 = require('sqlite3').verbose();
const contacts = require('./contacts');
const Store = require('electron-store');

const asyncFilter = async (arr, predicate) => Promise.all(arr.map(predicate))
	.then((results) => arr.filter((_v, index) => results[index]));

const store = new Store();

let mainWindow = null
function createWindow () {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: false
    }
  })

  // and load the index.html of the app.
  mainWindow.loadFile('index.html')

  // Open the DevTools.
  // mainWindow.webContents.openDevTools()
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  createWindow();
  reconnectDbAndRerender();

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit()
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

let db;
let chatData;
let CHAT_DB_PATH = path.join(homedir, "/Library/Messages/chat.db"); // hardcode for testing


// const mostRecentNotMeChatsQuery = `
//   SELECT text, is_from_me, chat_id, display_name, MAX(message_date)
//   FROM 
//     (message 
//     JOIN chat_message_join ON chat_message_join.message_id = message.ROWID
//     JOIN chat ON chat_message_join.chat_id = chat.ROWID
//     )
//   GROUP BY 
//     chat_id
//   HAVING
//     is_from_me == 0
//   ORDER BY
//     message_date DESC
// `

// const peopleInChatQuery = `
// SELECT id, chat_id
// FROM
// 	chat_handle_join
// 	JOIN handle ON chat_handle_join.handle_id = handle.ROWID
// `

// dont ask how this works. selects the one text per conversation that i havent yet responded to. in date order
const mostRecentNotMeChatsWithHandlesQuery = `
SELECT * FROM

(
SELECT text, is_from_me, chat_id, display_name, MAX(message_date) as date
FROM 
  (message 
  JOIN chat_message_join ON chat_message_join.message_id = message.ROWID
  JOIN chat ON chat_message_join.chat_id = chat.ROWID
  )
GROUP BY 
  chat_id
HAVING
  is_from_me == 0
ORDER BY
  message_date DESC
) AS MessageTable
  
JOIN 

(
SELECT GROUP_CONCAT(id) as numbers, chat_id
FROM
	chat_handle_join
	JOIN handle ON chat_handle_join.handle_id = handle.ROWID
GROUP BY
	chat_id
) AS HandleTable
	
ON MessageTable.chat_id = HandleTable.chat_id
`


async function reloadDatabase() {
  // reload the database
  // TODO: do we really have to close and reopen the connection every time?
  if(fs.existsSync(CHAT_DB_PATH)) {
    if(db) {
      console.log("closing");
      await db.close();
    } 

    db = new sqlite3.Database(CHAT_DB_PATH, sqlite3.OPEN_READONLY, (err) => {
      if (err) {
        // TODO: if "need full disk access" error, direct user to System Settings to provision their terminal
        console.error(err.message);
        return
      }
      console.log('Connected to the chat database.');
    });
  } else {
    console.warn("Error loading db file: Does not exist");
  }
}

function queryDatabase(query) {
  return new Promise((res, rej) => {
    db.serialize(() => {
      db.all(query, (err, rows) => {
        if (err) {
          rej(err.message);
        }
        res(rows);
      })
    })
  });
}


async function loadAllMessageData() {
  // TODO: Check if these need to be reloaded, esp handleData
  let messageData = await queryDatabase(mostRecentNotMeChatsWithHandlesQuery);
  const thing = await asyncFilter(
    messageData, 
    async (message_row) => {
      // discard if marked as dismissed
      let stored_data = await store.get(`${message_row.chat_id}`);
      if(!stored_data) return true;

      return stored_data.dismissed_date < message_row.date;
    })
  return thing.map(
    (message) => {  
      // enrich with contact info
      let groupNumbers = message.numbers.split(",");
      let groupContacts = groupNumbers.map(contacts.getContactByNumber);
      return {...message, contacts: groupContacts};
    }
  );
}

async function reconnectDbAndRerender() {
  await reloadDatabase();
  let data = await loadAllMessageData();
  mainWindow.webContents.send("app:render-message-list", data);
}

ipcMain.handle( 'app:ready' , reconnectDbAndRerender);

ipcMain.handle( 'app:requery-db', async (_event, _arg) => {
  reconnectDbAndRerender();
});

ipcMain.handle( 'app:mark-dismissed', async (_event, message_row) => {
  // console.log("got row data:", message_row);
  store.set(`${message_row.chat_id}.dismissed_date`, message_row.date);
  // console.log(`just set value at ${message_row.chat_id}.dismissed_date`);
  // console.log(await store.get(`${message_row.chat_id}`));
  reconnectDbAndRerender();
});

let fsWait = false;
fs.watch(CHAT_DB_PATH, (_event, filename) => {
  if(filename) {
    console.log("filechange event");
    if(fsWait) return;
    fsWait = setTimeout(() => {
      fsWait = false;
    }, 100);
    console.log(`${filename} file actually changed`);
    //getUnrepliedMessages();

    reconnectDbAndRerender();
  }
})