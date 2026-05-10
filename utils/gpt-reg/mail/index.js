'use strict';

const { SmvmailService } = require('./smvmail');
const { MailTmService }  = require('./mailtm');

function getMailService(type) {
    switch ((type || '').toLowerCase()) {
        case 'smv':
        case 'smvmail':
            return { service: new SmvmailService(), label: 'smvmail.com' };
        case 'mailtm':
        case 'mail.tm':
            return { service: new MailTmService(), label: 'mail.tm' };
        default:
            return { service: new SmvmailService(), label: 'smvmail.com' };
    }
}

module.exports = { getMailService };
