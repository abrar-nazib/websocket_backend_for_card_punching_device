require('dotenv').config();

const PORT = process.env.PORT || 3000;

const fs = require("fs");
const express = require("express")
const { Server } = require('socket.io');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);


app.use(express.json())

// Load json file
const devices = JSON.parse(fs.readFileSync("devices.json"));
const cards = JSON.parse(fs.readFileSync("cards.json"));
const logs = JSON.parse(fs.readFileSync("logs.json"));

// Find device by mac
function findDevice(mac) {
    // Find and return the device + index of the device
    const device = devices.find(device => device.mac === mac);
    return device;
}

// Find card by rfid
function findCard(rfid) {
    // Find and return the card + index of the card
    const card = cards.find(card => card.rfid === rfid);
    return card;
}

io.use((socket, next) => {
    // Middleware
    // Attach identifier to socket
    const mac_address = socket.handshake.query.auth;

    const device = findDevice(mac_address);
    // Revoke the socket connection if the device is not found
    if (!device) {
        console.log("Authentication Error Occured!");
        return next(new Error("Authentication error"));
    }

    socket.entity = {}
    socket.entity['type'] = 'device';
    for (const key in device) {
        socket.entity[key] = device[key];
    }

    // Get the device index
    const index = device.index;

    // Update the device status
    devices[index].status = true;

    // Save the updated devices to the json file
    fs.writeFileSync("devices.json", JSON.stringify(devices, null, 4));

    next();
});

io.on('connection', (socket) => {
    console.log("A socket connection has been made!");
    console.log(socket.entity);

    // Socket is the connected user
    socket.on("disconnect", () => {
        console.log("Socket disconnected!");
        console.log(socket.entity);

        // Update the device status
        const index = socket.entity.index;
        devices[index].status = false;

        // Save the updated devices to the json file
        fs.writeFileSync("devices.json", JSON.stringify(devices, null, 4));


    });

    // Listen for chat message
    socket.on("gps", (msg) => {
        console.log("GPS data received!");
        console.log(msg);
        const index = socket.entity.index;
        // Save the gps data to the device
        devices[index].gps = `${msg.lat},${msg.lng}`;
        // Save the updated devices to the json file
        fs.writeFileSync("devices.json", JSON.stringify(devices, null, 4));

        socket.emit("gps", "GPS data received!");
    });


    // Listen for card punch
    socket.on("card_punch", (msg) => {
        console.log("Card punch received!");
        console.log(msg);

        const card = findCard(msg.rfid);
        const index = card.index;

        if (!card) {
            console.log("Card not found!");
            socket.emit("card_punch", { error: "Card not found!" });
            return;
        }

        if (card.balance <= 0) {
            console.log("Insufficient balance!");
            socket.emit("card_punch", { error: "Insufficient balance!" });
            return;
        }

        // Take the punch and deduct the balance
        if (card.status === true) {
            card.balance -= 10;
        }
        card.status = !card.status;

        // Log the card punch
        const log = {
            card: card.rfid,
            device: socket.entity.mac,
            gps_location: socket.entity.gps,
            timestamp: new Date().toISOString(),
            type: card.status ? "check in" : "check out"
        }
        let warning = "";
        if (card.balance <= 50) {
            warning = "Warning: Low Balance!";
        }
        // Save the log to the logs
        logs.push(log);

        // Save the updated logs to the json file
        fs.writeFileSync("logs.json", JSON.stringify(logs, null, 4));

        // Save the updated cards to the json file
        cards[index] = card;
        fs.writeFileSync("cards.json", JSON.stringify(cards, null, 4));

        // Emit the card data to the device
        socket.emit("card_punch", { message: `Success: ${card.status ? "Check In" : "Check Out"}.${warning}` });

    });

});

app.get("/", (req, res) => {
    // console.log(__dirname);
    res.sendFile(path.join(__dirname, "index.html"));
});


// Run the websocket server


server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
