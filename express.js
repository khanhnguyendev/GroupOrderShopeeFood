const path = require("path"),
  express = require("express"),
  morgan = require("morgan"),
  fs = require("fs"),
  io = require("socket.io"),
  bodyParser = require("body-parser"),
  thoughtRoutes = require("./routes/thoughtRoutes"),
  cors = require("cors");

module.exports.init = () => {

  const CONNECTION = "CONNECTION";
  const DATA = "DATA";
  const DEBUG = "DEBUG";
  const SUCCESS = "200";
  const ERROR = "400";
  const AUTHORITY = "401";

  //initialize app
  const app = express();

  

  app.use(cors());

  //morgan used for logging HTTP requests to the console
  app.use(morgan("dev"));

  app.use(express.static(__dirname + '/public'));
  app.use(express.urlencoded({ extended: true }));
  app.set("views", __dirname + "/views");
  app.set("view engine", "ejs");

  const rooms = {};

  //bodyParser middleware used for resolving the req and res body objects (urlEncoded and json formats)
  app.use(bodyParser.urlencoded({ extended: true }));
  app.use(bodyParser.json());

  //add routers
  app.use("/api/thought", thoughtRoutes);

  app.get("/", (req, res) => {
    res.render("index", { rooms: rooms });
  });
  
  app.post("/room", (req, res) => {
    // Handle url not available
    if (rooms[req.body.orderShopName] != null) {
      return res.redirect("/");
    }

    // Clear menu before create new room
    fs.writeFile(__dirname + "/dataJSON/menu.json", "[]", function () {
      logWriter(DATA, "Menu has been reset");
    });
  
    // Clear order log before create new room
    fs.writeFile(__dirname + "/dataJSON/orders.json", "[]", function () {
      logWriter(DATA, "Order log has been cleared");
    });
  
    roomName = req.body.orderShopName
    rooms[roomName] = { users: {} };
  
    // Get shop url
    shopUrl = req.body.orderShopUrl;
  
    res.redirect(roomName);
  });

  app.get("/:room", (req, res) => {
    const room = rooms[req.params.room];
    if (!room) {
      return res.redirect("/");
    }
  
    const menuInfo = fs.readFileSync(__dirname + "/dataJSON/menu.json");
    if (menuInfo.length < 3) {
      return fetchShopeeFood(req, res);
    }
  
    const ordersHistory = fs.readFileSync(__dirname + "/dataJSON/orders.json");
  
    res.render("room", {
      roomName: req.params.room,
      resName: restaurantName,
      foods: JSON.parse(menuInfo),
      orders: JSON.parse(ordersHistory),
      sumOrders: summaryOrders(JSON.parse(ordersHistory)),
      totalItems: JSON.parse(ordersHistory).length,
      totalPrice: calTotalPrice(JSON.parse(ordersHistory)),
    });
  });

  // io.on("connection", (socket) => {
  //   socket.on("new-user", (room, name) => {
  //     socket.join(room);
  //     rooms[room].users[socket.id] = name;
  //     socket.to(room).broadcast.emit("user-connected", name);
  //     logWriter(CONNECTION, name + " connected to " + room);
  //   });
  
  //   socket.on("old-user", (room, name) => {
  //     socket.join(room);
  //     rooms[room].users[socket.id] = name;
  //     socket.to(room).broadcast.emit("user-connected", name);
  //     logWriter(CONNECTION, name + " connected to " + room);
  //   });
  
  //   socket.on("disconnect", () => {
  //     getUserRooms(socket).forEach((room) => {
  //       socket
  //         .to(room)
  //         .broadcast.emit("user-disconnected", rooms[room].users[socket.id]);
  //       logWriter(
  //         CONNECTION,
  //         rooms[room].users[socket.id] + " disconnect to " + room
  //       );
  //       delete rooms[room].users[socket.id];
  //     });
  //   });
  // });
  
  /**
   * Get users room
   */
  function getUserRooms(socket) {
    return Object.entries(rooms).reduce((names, [name, room]) => {
      if (room.users[socket.id] != null) names.push(name);
      return names;
    }, []);
  }
  
  /**
   * Get Date Time
   */
  function getDateTime() {
    var currentDate = new Date();
    return (
      "[" +
      String(currentDate.getDate()).padStart(2, "0") +
      "/" +
      String(currentDate.getMonth() + 1).padStart(2, "0") +
      "/" +
      currentDate.getFullYear() +
      " @ " +
      String(currentDate.getHours()).padStart(2, "0") +
      ":" +
      String(currentDate.getMinutes()).padStart(2, "0") +
      ":" +
      String(currentDate.getSeconds()).padStart(2, "0")
    );
  }
  
  /**
   * Log Writer
   */
  function logWriter(type, message) {
    console.log(getDateTime() + " " + type + "] " + message);
  }
  
  async function fetchShopeeFood(req, res) {
    getResId(req, res);
  }
  
  /**
   * Get Restaurant ID
   */
  async function getResId(req, res) {
    import("node-fetch")
      .then((module) => {
        const fetch = module.default;
  
        fetch(
          "https://gappapi.deliverynow.vn/api/delivery/get_from_url?url=" +
            shopUrl.replace("https://shopeefood.vn/", ""),
          {
            method: "GET",
            headers: {
              "x-foody-access-token": "",
              "x-foody-api-version": "1",
              "x-foody-app-type": "1004",
              "x-foody-client-id": "",
              "x-foody-client-language": "en",
              "x-foody-client-type": "1",
              "x-foody-client-version": "3.0.0",
            },
          }
        )
          .then((response) => {
            if (!response.ok) {
              throw new Error("Network response was not OK");
            }
            return response.json();
          })
          .then((deliveryInfo) => {
            logWriter(DEBUG, "Get delivery info successful");
            getRestaurantName(deliveryInfo, req, res);
          })
          .catch((error) => {
            logWriter(
              DEBUG,
              "There has been a problem with your fetch operation" + error
            );
            logWriter(DEBUG, "getResId " + error);
          });
      })
      .catch((error) => console.error(error));
  }
  
  /**
   * Get Restaurant Name
   */
  async function getRestaurantName(deliveryInfo, req, res) {
    let API = `https://gappapi.deliverynow.vn/api/delivery/get_detail?id_type=2&request_id=${deliveryInfo.reply.delivery_id}`;
  
    import("node-fetch")
      .then((module) => {
        const fetch = module.default;
  
        fetch(API, {
          method: "GET",
          headers: {
            "x-foody-client-id": "",
            "x-foody-client-type": "1",
            "x-foody-app-type": "1004",
            "x-foody-client-version": "3.0.0",
            "x-foody-api-version": "1",
            "x-foody-client-language": "vi",
            "x-foody-access-token":
              "6cf780ed31c8c4cd81ee12b0f3f4fdaf05ddf91a29ffce73212e4935ed9295fd354df0f4bc015478450a19bf80fddbe13302a61aa0c705af8315aae5a8e9cd6b",
          },
        })
          .then((response) => {
            if (!response.ok) {
              throw new Error("Network response was not OK");
            }
            return response.json();
          })
          .then((json) => {
            logWriter(DEBUG, "Get restaurant name successful");
            restaurantName = json.reply.delivery_detail.name;
            getDeliveryDishes(deliveryInfo, req, res);
          })
          .catch((error) => {
            logWriter(
              DEBUG,
              "There has been a problem with your fetch operation"
            );
            logWriter(DEBUG, "getRestaurantName " + error);
          });
      })
      .catch((error) => console.error(error));
  }
  
  async function getDeliveryDishes(deliveryInfo, req, res) {
    let urlAPI = `https://gappapi.deliverynow.vn/api/dish/get_delivery_dishes?id_type=2&request_id=${deliveryInfo.reply.delivery_id}`;
  
    import("node-fetch")
      .then((module) => {
        const fetch = module.default;
  
        fetch(urlAPI, {
          method: "GET",
          headers: {
            "x-foody-client-id": "",
            "x-foody-client-type": "1",
            "x-foody-app-type": "1004",
            "x-foody-client-version": "3.0.0",
            "x-foody-api-version": "1",
            "x-foody-client-language": "vi",
            "x-foody-access-token":
              "6cf780ed31c8c4cd81ee12b0f3f4fdaf05ddf91a29ffce73212e4935ed9295fd354df0f4bc015478450a19bf80fddbe13302a61aa0c705af8315aae5a8e9cd6b",
          },
        })
          .then((response) => {
            if (!response.ok) {
              throw new Error("Network response was not OK");
            }
            return response.json();
          })
          .then((json) => {
            logWriter(DEBUG, "Get delivery detail successful");
            // Filter menu list
            getMenuJson(json, req, res);
          })
          .catch((error) => {
            logWriter(
              DEBUG,
              "There has been a problem with your fetch operation"
            );
            logWriter(DEBUG, "getDeliveryDishes " + error);
          });
      })
      .catch((error) => console.error(error));
  }
  
  /**
   * Get menu list
   */
  function getMenuJson(json, req, res) {
    let menuJson = [];
    json.reply.menu_infos.forEach((menuInfo) => {
      menuInfo.dishes.forEach((dish) => {
        let menu = {
          title: dish.name,
          image: dish.photos[1].value,
          des: dish.description,
          price: dish.price.text,
        };
        menuJson.push(menu);
      });
    });
  
    // Write to file
    saveMenuJson(menuJson, req, res);
  }
  
  /**
   * Saving menu list to file
   */
  function saveMenuJson(menuJson, req, res) {
    let ordersData = [];
  
    fs.writeFile(
      __dirname + "/dataJSON/menu.json",
      JSON.stringify(menuJson),
      "utf8",
      function (err) {
        if (err) {
          logWriter(DEBUG, "An error occured while writing JSON Object to File.");
          return logWriter(err);
        }
        logWriter(DEBUG, "Saving menu JSON complete...");
      }
    );
  
    res.render("room", {
      roomName: req.params.room,
      resName: restaurantName,
      foods: menuJson,
      orders: ordersData,
      sumOrders: ordersData,
      totalItems: 0,
      totalPrice: 0,
    });
  }
  
  function summaryOrders(ordersJson) {
    let sumOrders = [];
  
    for (let i = 0; i < ordersJson.length; i++) {
      let foodTitle = ordersJson[i].foodTitle;
      let foodAmount = parseInt(ordersJson[i].foodAmount);
      let foodPrice = parseInt(ordersJson[i].foodPrice);
  
      let order = {};
  
      if (order[foodTitle]) {
        order.foodTitle = foodTitle;
        order.foodAmount += foodAmount;
      } else {
        order.foodTitle = foodTitle;
        order.foodAmount = foodAmount;
      }
      order.foodPrice = foodPrice * foodAmount;
      sumOrders.push(order);
    }
  
    return sumOrders;
  }
  
  function calTotalPrice(ordersJson) {
    let totalPrice = 0;
    for (let i = 0; i < ordersJson.length; i++) {
      totalPrice += parseInt(ordersJson[i].foodPrice);
    }
    return `${totalPrice},000đ`;
  }

  // //for production build
  // if (process.env.NODE_ENV === "production") {
  //   //Serve any static files
  //   app.use(express.static(path.join(__dirname, "../../client/build")));

  //   //Handle React routing, return all requests to React app
  //   app.get("*", function (req, res) {
  //     res.sendFile(path.join(__dirname, "../../client/build", "index.html"));
  //   });
  // }

  return app;
};
