
const express = require('express');
const app = express();
const multer = require('multer');
const fs = require('fs');
const utf8 = require('utf8');
const bodyParser = require('body-parser');
const session = require('express-session');
const tz = require('moment-timezone');
const moment = require('moment');
const rimraf = require("rimraf");
const jsonexport = require('jsonexport');

const mongoClient = require('mongodb').MongoClient;
const mongoObjectID = require('mongodb').ObjectId;
const mongo = 'mongodb://localhost:27017/hweb'

let mongodb = null

let { PythonShell } = require('python-shell');
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(session({
    saveUninitialized: false,
    resave: false,
    secret: '加密用的字串',
    cookie: {
        maxAge: 3600000, //一小時
    }
}))

// set the storage engine path 
const storage = multer.diskStorage({
    destination: 'public/tmpTLC/', //save path
    filename: function (req, file, cb) {
        cb(null, file.originalname);
    }
});

//init upload
const upload = multer({ storage: storage });//single image Key:myImage

//set issue storage path

const issueStorage = multer.diskStorage({

    destination: 'public/sightingFile/', //save path
    filename: function (req, file, cb) {
        cb(null, new Date().getTime() + "-" + file.originalname);
    },
    limit: {
        fileSize: 5000000
    }
});

const uploadEngine1 = multer({ storage: issueStorage });//single image Key:myImage

//email system
const nodemailer = require('nodemailer');
const { resolve } = require('path');
const { Console } = require('console');
const { SSL_OP_SSLEAY_080_CLIENT_DH_BUG } = require('constants');
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'alisunlcfc@gmail.com',
        pass: 'nbvmrperbmayaemk'
    }
})


// member system//
// Create a connect to MongoDB  Q 為什app要設在db 連接裡面
mongoClient.connect(mongo, { useUnifiedTopology: true }, function (err, db) {
    if (err) return console.log(err)
    mongodb = db.db("hweb");
    // mongodb = db

    // Start Service
    app.listen(3002, function () {
        console.log('Server Starts')
    })
})

//確認登入者的middleware
const checkUser = function (req, res, next) {
    req.userData = {
        isLogined: !!req.session.loginUser,
        loginUser: req.session.loginUser,
        userEName: req.session.userEName,
        role: req.session.role,
        sightingrole: req.session.sightingrole
    };
    next();
}
app.use(checkUser);

// app.use()
app.get('/', (req, res) => {
    const data = req.userData;

    res.render('home', data);
});

app.post('/', (req, res) => {
    const data = req.userData;

    res.render('home', data);
});


app.get('/user/trysession', (req, res) => {
    req.session.views = req.session.views || 0;
    req.session.views++;
    res.contentType('text/plain');
    res.write('拜訪次數:' + req.session.views + "\n");
    res.end(JSON.stringify(req.session));

})


//////////////////// 登入 ////////////////////
app.get('/user/login', async (req, res) => {
    const data = req.userData;
    const timeFormat = "YYYY-MM-DD HH:mm:ss";
    const mo1 = moment(new Date());
    if (req.session.flashMsg) {
        data.flashMsg = req.session.flashMsg;
        delete req.session.flashMsg;
    }
    if (data.isLogined) {//true
        console.log(`${data.loginUser} 於 ${mo1.format(timeFormat)} 登入`)
    }
    if (req.session.referer) {
        data.referer = req.session.referer;
        delete req.session.referer;
    }
    async function checkUsersightingRole(account) {
        const collection = mongodb.collection('users');
        const role = await collection.findOne(account, { 'projection': { "sightingrole": 1, "_id": 0 } })

        if (role) {
            req.session.sightingrole = role.sightingrole;
        } else {
            req.session.sightingrole = '';
        }
    }
    async function checkUserRole(account) {
        const collection = mongodb.collection('users');
        const role = await collection.findOne(account, { 'projection': { "role": 1, "_id": 0 } })

        if (role) {
            req.session.role = role.role;
        } else {
            req.session.role = '';
        }
    }


    let account = { 'userAccount': req.session.loginUser };
    await checkUserRole(account);
    await checkUsersightingRole(account);

    res.render('login', data);
})



app.post('/user/login', (req, res) => {
    const collection = mongodb.collection('users');
    //檢查有沒有這個帳號 
    let account = {
        'userAccount': req.body.userAccount,
        'userPW': req.body.password
    };
    collection.findOne(account, (err, document) => {
        if (document) { //true
            req.session.loginUser = req.body.userAccount;
            req.session.userEName = document.userEName;
            req.session.referer = req.body.referer;
        } else { // false
            req.session.flashMsg = "帳號密碼錯誤";
        }
        res.redirect('/user/login');
    })
    // res.redirect('/user/login'); 如果放這個 redirect之後session會被更新
})


//////////////////// 登出 ////////////////////
app.get('/user/logout', (req, res) => {
    delete req.session.loginUser;
    res.redirect('/user/login')
})

//////////////////// 註冊流程 ////////////////////
app.get('/user/register', (req, res) => {
    const data = req.userData;
    res.render('register', data);
});
app.get('/user/registerSuccess', (req, res) => {
    res.render('registerSuccess');
});

app.get('/try-finddb', (req, res) => {
    const collection = mongodb.collection('users');
    const myemail = 'ali.sun@lcfuturecenter.com';
    let emailData = { 'userEmail': myemail };
    collection.findOne({ 'userEmail': myemail }, (err, document) => {
        console.log(document);
        // const data = document.name
        res.json(document);
    })

})

app.post('/user/register', upload.single('tlcfile'), (req, res) => {
    // console.log('user in session')
    // console.log(req.session);
    const collection = mongodb.collection('users');
    const timeFormat = "YYYY-MM-DD HH:mm:ss";
    const mo1 = moment(new Date());

    //檢查有沒有這個帳號 有的話再insert     
    let account = { 'userAccount': req.body.userAccount };

    collection.findOne(account, (err, document) => {

        if (document) {
            console.log(`${document.userAccount} 嘗試重複註冊，但在 ${document.create_date}已註冊過帳號`);
            res.json({ alert: "帳號已存在" })//json字串過去一定要json格式再.出來
        } else {
            let insertDate = {
                'userCName': req.body.userCName,
                'userEName': req.body.userEName,
                'userDepartment': req.body.userDepartment,
                'userAccount': req.body.userAccount,
                'userEmail': req.body.userAccount + "@lcfuturecenter.com",
                'userPW': req.body.userpassword,
                'create_date': mo1.format(timeFormat),
                "role": "",
                "sightingrole": ""
            }
            collection.insertOne(insertDate, function (err, document) {
                if (err) return res.json(err);

                console.log(`${account.userAccount} 註冊成功`);
                //   res.redirect('registerSuccess');
                res.json({ alert: "帳號註冊成功" })
            })
        }
    })
})

//////////////////// 忘記密碼 ////////////////////
app.get('/user/forgetpw', (req, res) => {
    res.render('forgetPW')
})

app.post('/user/forgetpw', upload.single('tlcfile'), (req, res) => {
    const collection = mongodb.collection('users');
    let account = {
        'userAccount': req.body.userAccount
    };
    collection.findOne(account, (err, document) => {
        if (document) { //true

            let mailOptions = {
                from: 'alisunlcfc@gmail.com',
                to: `${account.userAccount}@lcfuturecenter.com`,
                subject: "Here's your password!",
                text: `密碼: ${document.userPW}`
            };
            console.log(`${account.userAccount} 忘記密碼`)

            transporter.sendMail(mailOptions, function (error, info) {
                if (error) {
                    console.log(error);
                } else {
                    console.log(`密碼已成功寄送給 ${mailOptions.to}`);
                    // console.log(info.response);
                }
            })

            res.json({ msg: "密碼已寄送" })
        } else { // false
            console.log(`${account.userAccount} 帳號不存在`);
            res.json({ msg: "帳號不存在" })
        }
    })
})

app.get('/uploaddata', (req, res) => {
    // const data = req.userData;

    res.render('uploaddata');
});

app.post('/uploaddata', upload.single('NREFile'), (req, res) => {
    const data = req.userData;
    console.log(req.file);//req.files 報錯
    const files = {
        "data": req.file
    }
    res.json(files);
});


//parse TLC!!!!!!!!!!!! 
app.get('/uploaddata/parsestandardnre', pythonParseTLC)
function pythonParseTLC(req, res) {
    console.log("Running python file.");
    // console.log(req.query.TLCFilePath);
    // console.log(req.query.project);
    path = ".\\" + req.query.FilePath;
    let options = {
        args: [
            path
        ]
    }

    // 因為python file 路徑填錯,所以一直報錯
    PythonShell.run('./pyfile/test.py', options, (err, data) => {
        if (err) res.send(err)
        const parsedString = JSON.parse(data)
        console.log("Program run done.");
        console.log("Result: ", parsedString);
    
        parsedString.downloadPath = parsedString.downloadPath.replace(".\\public", "")
        res.json(parsedString)
    })

};




// 自定404 page
app.use((req, res) => {
    res.type('text/plain');
    res.status(404);
    res.send('404 - Page cannot found.');
});
