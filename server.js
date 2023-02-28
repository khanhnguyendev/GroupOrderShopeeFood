const express = require("./express.js"),
  mongoose = require("mongoose");
cron = require("node-cron");

// Use env port or default
const port = process.env.PORT || 5000;

//establish socket.io connection
const app = express.init();
const server = require("http").createServer(app);
const io = require("socket.io")(server);

io.on("connection", (socket) => {
  console.log("socket.io: User connected: ", socket.id);

  socket.on("disconnect", () => {
    console.log("socket.io: User disconnected: ", socket.id);
  });
});

//start the server
server.listen(port, () => {
  console.log(`Server now running on port ${port}!`)
  console.log(`http://localhost:${port}`)
});

//connect to db
mongoose.connect(process.env.DB_URI || require("./config/config").db.uri, {
  useNewUrlParser: true,
  useCreateIndex: true,
  useUnifiedTopology: true,
  useFindAndModify: false,
});

const connection = mongoose.connection;

connection.once("open", () => {
  console.log("MongoDB database connected");

  console.log("Setting change streams");
  const thoughtChangeStream = connection.collection("orderhistories").watch();

  thoughtChangeStream.on("change", (change) => {
    switch (change.operationType) {
      case "insert":
        const thought = {
          _id: change.fullDocument._id,
          roomName: change.fullDocument.roomName,
          userName: change.fullDocument.userName,
          title: change.fullDocument.title,
          price: change.fullDocument.price,
          qty: change.fullDocument.qty,
          date: change.fullDocument.date,
        };

        io.emit("receive-order", thought);
        break;

      case "delete":
        io.of("/api/socket").emit("deletedOrderHistory", change.documentKey._id);
        break;
    }
  });
});

//schedule deletion of thoughts at midnight
cron.schedule("0 0 0 * * *", async () => {
  await connection.collection("thoughts").drop();

  io.of("/api/socket").emit("thoughtsCleared");
});

connection.on("error", (error) => console.log("Error: " + error));
