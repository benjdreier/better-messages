const contacts_api = require('node-mac-contacts');
let contacts;
let contacts_by_number = {};

function getContactData() {
    if(!contacts) {
        if(contacts_api.getAuthStatus !== "Authorized") {
            contacts_api.requestAccess();
        }
        //contacts = contacts_api.getAllContacts(["contactThumbnailImage"]);
        contacts = contacts_api.getAllContacts();
    }
}

// For use with phone numbers in particula
const nonnumeric = /[^0-9]/ig;
function stripNonNumeric(s) {
    let st = s.trim();
    if(st.startsWith("+1")) {
        st = st.substr(2);
    }
    return st.replaceAll(nonnumeric, "");
}

exports.printContacts = () => {
    getContactData();
    console.log(contacts);
}

exports.getContactByNumber = (phone) => {
    getContactData();
    let phoneStripped = stripNonNumeric(phone);
    if(contacts_by_number[phoneStripped] === undefined) {
        // Linear search
        // TODO: just build contact_by_phone in one pass like whatever idk
        for(const contact of contacts) {
            if(contact.phoneNumbers.map(stripNonNumeric).includes(phoneStripped)) {
                contacts_by_number[phoneStripped] = contact;
                return contact;
            }
        }
        // Found nothing
        contacts_by_number[phoneStripped] = {phoneNumbers: [phone]};
    }

    return contacts_by_number[phoneStripped];
}