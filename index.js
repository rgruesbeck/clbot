const fs = require('fs');
const util = require('util');
const craigslist = require('node-craigslist');
const levelup = require('levelup');
const db = levelup('./leveldb');
const Slack = require('slack-node');
const slackToken = process.env.SLACK_TOKEN;
const schedule = require('node-schedule');

const slack = new Slack(slackToken);
let client = new craigslist.Client({
    city : 'sfbay'
});

var access_logs = fs.createWriteStream('./access.log', { flags: 'a' })
, error_logs = fs.createWriteStream('./error.log', { flags: 'a' });

function log(message, type) {
    if (type == 'err') {
        error_logs.write(util.format(message) + '\n');
    } else {
        access_logs.write(util.format(message) + '\n');
        console.log(message);
    }
}

function search(s, cb){
    client
        .search(s.opts, s.query)
        .then((listings) => {
            return listings
                .filter((l) => {
                    if (s.locations) {
                        var regexp = new RegExp(s.locations, 'i');
                        return regexp.test(l.location);
                    } else {
                        return true;
                    }
                })
                .filter((l) => {
                    if (s.filter) {
                        var regexp = new RegExp(s.filter, 'i');
                        return regexp.test(l.title) === false;
                    } else {
                        return true;
                    }
                });
        })
        .then((listings) => {
            listings.forEach(cb);
        })
        .catch((err) => {
            log(err, 'err');
        });
};

function handlelisting(listing) {
    db.get(listing.pid, (err, val) => {
        if (err) {
            newlisting(listing);
        } else {
            log([new Date, 'old', listing.title].join(" "));
        }
    });
}

function newlisting(listing) {
    db.put(listing.pid, JSON.stringify(listing), () => {
        postslacklisting(listing);
        log([new Date, 'new', listing.title].join(" "));
    });
}

function renderlisting(l) {
    return [
        l.title,
        l.location,
        l.url
    ].join(' ');
}

function postslacklisting(listing) {
    slack.api('chat.postMessage', {
        text: renderlisting(listing),
        channel:'#general'
    }, function(err, response){
        if (err) {
            log(err, 'err');
        } else {
            //log(response.message.text);
        }
    });
}

var d = schedule.scheduleJob('*/15 * * * *', function(fireDate){
    fs.readFile('./searches.json', 'utf8', function (err, data) {
        if (err) {
            log(err, 'err');
        } else {
            let searches = JSON.parse(data);
            searches.forEach((s) => {
                log([new Date, 'searching', s.opts.category, s.query].join(" "));
                search(s, (listing) => {
                    handlelisting(listing);
                });
            });
        }
    });
});
