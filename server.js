const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const session = require('cookie-session');
const fs = require('fs');
const formidable = require('formidable');
const MongoClient = require('mongodb').MongoClient;
const assert = require('assert');
const ObjectID = require('mongodb').ObjectID;
const mongourl = 'mongodb+srv://cyt622:comps381f@cluster0-65alb.azure.mongodb.net/test?retryWrites=true&w=majority';
const dbName = 'test';

// support parsing of application/json type post data
app.use(bodyParser.json());

//support parsing of application/x-www-form-urlencoded post data
app.use(bodyParser.urlencoded({ extended: true }));

app.set('view engine', 'ejs');

app.use(session({
  name: 'session',
  keys: ['key1','key2']
}));

app.get('/', function(req, res) {
  if (!req.session.authenticated) {
    res.redirect('/login');
  }
  let client = new MongoClient(mongourl);
  client.connect((err) => {
    try {
      assert.equal(err,null);
    } catch (err) {
      res.status(500).end("MongoClient connect() failed!");
    }
    const db = client.db(dbName);
    let criteria = {};
    findRestaurant(db, {}, (results) => {
      client.close();
      console.log('Disconnected MongoDB');
      res.status(200).render("list", {userid:req.session.userid, results:results});
    });
  });
});
  
app.get('/register', (req, res) => {
  if (req.session.authenticated) {
    res.redirect('/');
  }
	res.status(200).render("register");
});
  
app.post('/register', function(req, res) {
  if (req.session.authenticated) {
    res.redirect('/');
  }
	console.log('Incoming request: ' + req.method);
	console.log('Path: ' + req.path);
	console.log('Request body: ', req.body);
  
  let client = new MongoClient(mongourl);
  client.connect((err) => {
    try {
      assert.equal(err,null);
    } catch (err) {
      res.status(500).end("MongoClient connect() failed!");
    }
    const db = client.db(dbName);
    let newUser = {};
    newUser['userid'] = req.body.userid;
    newUser['password'] = req.body.password;
    insertUser(db,newUser,(result) => {
      client.close();
      
      res.redirect('/login');
    });
  });
});

function insertUser(db, r, callback) {
  db.collection('user').insertOne(r, function(err, result) {
    assert.equal(err,null);
    console.log("insert was successful!");
    console.log(JSON.stringify(result));
    callback(result);
  });
}
  
app.get('/login', (req,res) => {
  if (req.session.authenticated) {
    res.redirect('/');
  }
	res.status(200).render("login");
});

app.post('/login', (req,res) => {
  if (req.session.authenticated) {
    res.redirect('/');
  }
  let client = new MongoClient(mongourl);
  client.connect((err) => {
    try {
      assert.equal(err,null);
    } catch (err) {
      res.status(500).end("MongoClient connect() failed!");
    }
    const db = client.db(dbName);
    findUser(db, (users) => {
      client.close();
      console.log('Disconnected MongoDB');
      users.forEach((user) => {
        if (user.userid == req.body.userid && user.password == req.body.password) {
          req.session.authenticated = true;
          req.session.userid = user.userid;			
        }
      });
      res.redirect('/');
    });
  });
});
  
let findUser = (db, callback) => {
  let cursor = db.collection('user').find({});
  let results = [];
  cursor.forEach((doc) => {
    results.push(doc);
  }, (err) => {
    // done or error
    assert.equal(err, null);
    callback(results);
  })
}

app.get('/new', (req, res) => {
  if (!req.session.authenticated) {
    res.redirect('/login');
  }
	res.status(200).render("new", {userid:req.session.userid});
});

app.post('/new', function(req, res) {
  if (!req.session.authenticated) {
    res.redirect('/login');
  }
	console.log('Incoming request: ' + req.method);
	console.log('Path: ' + req.path);

  
  let form = new formidable.IncomingForm();
  form.parse(req, (err, fields, files) => {
    if (fields.name == '') {
      res.end("You must enter the name of the restaurant");
    }
    else {
      console.log(JSON.stringify(files));
      if (files.photo.size == 0) {
        let client = new MongoClient(mongourl);
        client.connect((err) => {
          try {
            assert.equal(err,null);
          } catch (err) {
            res.status(500).end("MongoClient connect() failed!");
          }
          const db = client.db(dbName);
          let newRestaurant = {
            'name': fields.name,
            'borough': fields.borough,
            'cuisine': fields.cuisine,
            'address': {
              'street': fields.street,
              'building': fields.building,
              'zipcode': fields.zipcode,
              'coord': [fields.lat, fields.lon]
            },
            'owner': req.session.userid
          };
          console.log(JSON.stringify(newRestaurant));
          insertRestaurant(db,newRestaurant,(result) => {
            let doc = {};
            doc.status = "ok";
            let cursor = db.collection('restaurant').find().sort({"_id": -1}).limit(1);
            cursor.forEach((last) => {
              doc._id = ObjectID(last._id);
              console.log(ObjectID(last._id));
            }, (err) => {
              // done or error
              assert.equal(err, null);
            });
            client.close();

            res.status(200).type('json').json(doc).end();
          });
        });
      }
      else if (files.photo.size > 0) {
        let filename = files.photo.path;
        if (files.photo.type) {
          var mimetype = files.photo.type;
          console.log(`mimetype = ${mimetype}`);
        }

        if (!mimetype.match(/^image/)) {
          res.status(500).end("Upload file not image!");
          return;
        }

        fs.readFile(filename, (err,data) => {
          let client = new MongoClient(mongourl);
          client.connect((err) => {
            try {
              assert.equal(err,null);
            } catch (err) {
              res.status(500).end("MongoClient connect() failed!");
            }
            const db = client.db(dbName);
            let newRestaurant = {
              'name': fields.name,
              'borough': fields.borough,
              'cuisine': fields.cuisine,
              'photo': new Buffer.from(data).toString('base64'),
              'mimetype': mimetype,
              'address': {
                'street': fields.street,
                'building': fields.building,
                'zipcode': fields.zipcode,
                'coord': [fields.lat, fields.lon]
              },
              'owner': req.session.userid
            };
            console.log(JSON.stringify(newRestaurant));

            insertRestaurant(db,newRestaurant,(result) => {
              let doc = {};
              doc.status = "ok";
              let cursor = db.collection('restaurant').find().sort({"_id": -1}).limit(1);
              cursor.forEach((last) => {
                doc._id = ObjectID(last._id);
                console.log(ObjectID(last._id));
              }, (err) => {
                // done or error
                assert.equal(err, null);
              });
              client.close();


              res.status(200).type('json').json(doc).end();
            });
          });
        });
      }
    }

  });
});
  
function insertRestaurant(db, r, callback) {
  db.collection('restaurant').insertOne(r, function(err, result) {
    try {
      assert.equal(err,null);
    } catch(err) {
      let res = { status: "failed" };
      res.status(500).type('json').json(res).end();
    }
    
    console.log("insert was successful!");
    console.log(JSON.stringify(result));
    callback(result);
  });
}
  
app.get('/update/:_id', (req, res) => {
  if (!req.session.authenticated) {
    res.redirect('/login');
  }
  let client = new MongoClient(mongourl);
  client.connect((err) => {
    try {
      assert.equal(err,null);
    } catch (err) {
      res.status(500).end("MongoClient connect() failed!");
    }
    console.log('Connected to MongoDB');
    const db = client.db(dbName);
    let criteria = {};
    criteria['_id'] = ObjectID(req.params._id);
    findRestaurant(db, criteria, (restaurant) => {
      client.close();
      console.log('Disconnected MongoDB');
      let doc = restaurant[0];
      console.log(req.params._id);
      console.log(JSON.stringify(criteria));
      console.log(JSON.stringify(doc));
      
      try {
        assert(doc.owner, req.session.userid);
        res.status(200).render("update", {userid:req.session.userid, restaurant: doc});
      } catch (e) {
        res.redirect('/');
      }
      
      
      
    });
  });
});
  
app.post('/update/:_id', function(req, res) {
  if (req.session.authenticated) {
    res.redirect('/');
  }
	console.log('Incoming request: ' + req.method);
	console.log('Path: ' + req.path);
  
  let form = new formidable.IncomingForm();
  form.parse(req, (err, fields, files) => {
    console.log(JSON.stringify(files));
    if (files.photo.size == 0) {
      let client = new MongoClient(mongourl);
      client.connect((err) => {
        try {
          assert.equal(err,null);
        } catch (err) {
          res.status(500).end("MongoClient connect() failed!");
        }
        const db = client.db(dbName);
        let criteria = {};
        criteria['_id'] = ObjectID(req.params._id);
        let newRestaurant = {
          'name': fields.name,
          'borough': fields.borough,
          'cuisine': fields.cuisine,
          'address': {
            'street': fields.street,
            'building': fields.building,
            'zipcode': fields.zipcode,
            'coord': [fields.lat, fields.lon]
          },
          'owner': req.session.userid
        };
        console.log(JSON.stringify(criteria));
        console.log(JSON.stringify(newRestaurant));
        updateRestaurant(db, criteria, newRestaurant,(result) => {
          client.close();

          res.status(200).end("Updated successfully!");
        });
      });
    }
    else {
      let filename = files.photo.path;
      if (files.photo.type) {
        var mimetype = files.photo.type;
        console.log(`mimetype = ${mimetype}`);
      }

      if (!mimetype.match(/^image/)) {
        res.status(500).end("Upload file not image!");
        return;
      }

      fs.readFile(filename, (err,data) => {
        let client = new MongoClient(mongourl);
        client.connect((err) => {
          try {
            assert.equal(err,null);
          } catch (err) {
            res.status(500).end("MongoClient connect() failed!");
          }
          const db = client.db(dbName);
          let criteria = {};
          criteria['_id'] = ObjectID(req.params._id);
          let newRestaurant = {
            'name': fields.name,
            'borough': fields.borough,
            'cuisine': fields.cuisine,
            'photo': new Buffer.from(data).toString('base64'),
            'mimetype': mimetype,
            'address': {
              'street': fields.street,
              'building': fields.building,
              'zipcode': fields.zipcode,
              'coord': [fields.lat, fields.lon]
            },
            'owner': req.session.userid
          };
          console.log(JSON.stringify(criteria));
          console.log(JSON.stringify(newRestaurant));
          updateRestaurant(db, criteria, newRestaurant,(result) => {
            client.close();

            res.status(200).end("Updated successfully");
          });
        });
      });
    }

  });
});
  
function updateRestaurant(db, criteria, newDoc, callback) {
  db.collection('restaurant').replaceOne(criteria, newDoc, (err,result) => {
    
    assert.equal(err,null);
    
    console.log("update was successful!");
    console.log(JSON.stringify(result));
    callback(result);
  });
}
  
app.get('/rate/:_id', (req, res) => {
  if (!req.session.authenticated) {
    res.redirect('/login');
  }
  let client = new MongoClient(mongourl);
  client.connect((err) => {
    try {
      assert.equal(err,null);
    } catch (err) {
      res.status(500).end("MongoClient connect() failed!");
    }
    console.log('Connected to MongoDB');
    const db = client.db(dbName);
    let criteria = {
      '_id' : ObjectID(req.params._id),
      'grades' : { $elemMatch: {'user': req.session.userid}}
    };
    console.log(JSON.stringify(criteria));
    findRestaurant(db, criteria, (restaurant) => {
      client.close();
      console.log('Disconnected MongoDB');
      
      if (restaurant.length == 0) {
        res.status(200).render("rate", {userid:req.session.userid, restaurant:restaurant, _id: criteria._id});
        
      }
      else {
        res.redirect('/');
        
      }
      
      
    });
  });
});
  
app.post('/rate/:_id', (req,res) => {
  if (!req.session.authenticated) {
    res.redirect('/login');
  }
	console.log('Incoming request: ' + req.method);
	console.log('Path: ' + req.path);
	console.log('Request body: ', req.body);
  
  let score = req.body.score;
  if (score <= 0 || score > 10) {
    res.end("Invalid input");
  }
  else {
    let client = new MongoClient(mongourl);
    client.connect((err) => {
      try {
        assert.equal(err,null);
      } catch (err) {
        res.status(500).end("MongoClient connect() failed!");
      }
      const db = client.db(dbName);
      let criteria = {};
      criteria['_id'] = ObjectID(req.params._id);
      let newGrade = [{
        'user': req.session.userid,
        'score': req.body.score

      }];

      db.collection('restaurant').updateOne(
        criteria,
        {
          $push: { 'grades': newGrade[0] }
        },
        (err,result) => {
          assert.equal(err,null);

          console.log("Rated successfully!");
          console.log(JSON.stringify(result));
          client.close();
          console.log('Disconnected MongoDB');
          res.redirect('/');
        }
      );
    });
  }
  

});
  

app.get('/display', (req,res) => {
  let client = new MongoClient(mongourl);
  client.connect((err) => {
    try {
      assert.equal(err,null);
    } catch (err) {
      res.status(500).end("MongoClient connect() failed!");
    }      
    console.log('Connected to MongoDB');
    const db = client.db(dbName);
    let criteria = {};
    criteria['_id'] = ObjectID(req.query._id);
    findRestaurant(db, criteria, (restaurant) => {
      client.close();
      console.log('Disconnected MongoDB');
      console.log('Restaurant returned = ' + restaurant.length);
      console.log(JSON.stringify(restaurant));
      let doc = restaurant[0];
      res.status(200).render('restaurant', {userid: req.session.userid, restaurant: doc});
      
      
    });
  });
});
  
app.get('/delete/:_id', (req, res) => {
  if (!req.session.authenticated) {
    res.redirect('/login');
  }
  let client = new MongoClient(mongourl);
  client.connect((err) => {
    try {
      assert.equal(err,null);
    } catch (err) {
      res.status(500).end("MongoClient connect() failed!");
    }
    console.log('Connected to MongoDB');
    const db = client.db(dbName);
    let criteria = {
      '_id' : ObjectID(req.params._id)
    };
    console.log(JSON.stringify(criteria));
    findRestaurant(db, criteria, (restaurant) => {
      client.close();
      console.log('Disconnected MongoDB');
      console.log('Before deletion');
      console.log(JSON.stringify(criteria));
      console.log(JSON.stringify(restaurant));
      
      try {
        assert(restaurant.owner, req.session.userid);
        db.collection('restaurant').deleteOne(
          criteria,
          (err, result) => {
            assert.equal(err,null);

            console.log("Deleted successfully!");
            console.log(JSON.stringify(result));
            client.close();
            console.log('Disconnected MongoDB');
            res.redirect('/');
          }
        );
      } catch (e) {
        res.redirect('/');
      }
      
      
    });
  });
});

app.get('/search', (req, res) => {
  if (!req.session.authenticated) {
    res.redirect('/login');
  }
	res.status(200).render("search", {userid: req.session.userid});
});

app.post('/search', (req, res) => {
  if (!req.session.authenticated) {
    res.redirect('/login');
  }
  console.log(req.body);
  
  if (req.body.criteria == "name") {
    res.redirect('/api/restaurant/name/' + req.body.key);
  }
  else if (req.body.criteria == "borough") {
    res.redirect('/api/restaurant/borough/' + req.body.key);
  }
  else if (req.body.criteria == "cuisine") {
    res.redirect('/api/restaurant/cuisine/' + req.body.key);
  }
  
	res.status(200).render("search", {userid: req.session.userid});
});
  
  
app.get('/adv_search', (req, res) => {
  if (!req.session.authenticated) {
    res.redirect('/login');
  }
	res.status(200).render("adv_search", {userid: req.session.userid});
});
  
app.post('/adv_search', (req, res) => {
  let client = new MongoClient(mongourl);
  client.connect((err) => {
    try {
      assert.equal(err,null);
    } catch (err) {
      res.status(500).end("MongoClient connect() failed!");
    }      
    console.log('Connected to MongoDB');
    const db = client.db(dbName);
    let temp = {
      'name': (req.body.name ? ('/' + req.body.name + '/') : null),
      'borough': (req.body.borough ? ('/' + req.body.borough + '/') : null),
      'cuisine': (req.body.cuisine ? ('/' + req.body.cuisine + '/') : null),
      'owner': (req.body.owner ? ('/' + req.body.owner + '/') : null)
      
      
    };
    let criteria = {};
    for (var prop in temp) {
      if (temp[prop] != null) {
        criteria[prop] = temp[prop];
      }
    }
    
    console.log(JSON.stringify(criteria));
    
    
    findRestaurant(db, criteria, (results) => {
      
      client.close();
      console.log('Disconnected MongoDB');
      res.status(200).render("list", {userid:req.session.userid, results:results});
    });
  });
});
  
  
  
  
  
  
  
  

app.get('/api/restaurant/name/:name', function(req, res) {
  if (!req.session.authenticated) {
    res.redirect('/login');
  }
  let client = new MongoClient(mongourl);
  client.connect((err) => {
    try {
      assert.equal(err,null);
    } catch (err) {
      res.status(500).end("MongoClient connect() failed!");
    }
    const db = client.db(dbName);
    let criteria = {};
    criteria['name'] = req.params.name;
    findRestaurant(db, criteria, (results) => {
      client.close();
      console.log('Disconnected MongoDB');
      if (results.length == 0) {
        results = [];
      }
      res.status(200).type('json').json(results).end();
    });
  });
});

app.get('/api/restaurant/borough/:borough', function(req, res) {
  if (!req.session.authenticated) {
    res.redirect('/login');
  }
  let client = new MongoClient(mongourl);
  client.connect((err) => {
    try {
      assert.equal(err,null);
    } catch (err) {
      res.status(500).end("MongoClient connect() failed!");
    }
    const db = client.db(dbName);
    let criteria = {};
    criteria['borough'] = req.params.borough;
    findRestaurant(db, criteria, (results) => {
      client.close();
      console.log('Disconnected MongoDB');
      if (results.length == 0) {
        results = [];
      }
      res.status(200).type('json').json(results).end();
    });
  });
});

app.get('/api/restaurant/cuisine/:cuisine', function(req, res) {
  if (!req.session.authenticated) {
    res.redirect('/login');
  }
  let client = new MongoClient(mongourl);
  client.connect((err) => {
    try {
      assert.equal(err,null);
    } catch (err) {
      res.status(500).end("MongoClient connect() failed!");
    }
    const db = client.db(dbName);
    let criteria = {};
    criteria['cuisine'] = req.params.cuisine;
    findRestaurant(db, criteria, (results) => {
      client.close();
      console.log('Disconnected MongoDB');
      if (results.length == 0) {
        results = [];
      }
      res.status(200).type('json').json(results).end();
    });
  });
});

let findRestaurant = (db, criteria, callback) => {
  let cursor = db.collection('restaurant').find(criteria);
  let results = [];
  cursor.forEach((doc) => {
    results.push(doc);
  }, (err) => {
    // done or error
    assert.equal(err,null);
    callback(results);
  })
}

app.get('/logout',function(req,res) {
  req.session = null;
  res.redirect('/');
});
















app.listen(process.env.PORT || 8099);
