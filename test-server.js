const express = require("express");
const app = express();

app.post("/split", (req, res) => {
  res.send("SPLIT ROUTE WORKS");
});

app.listen(3000, () => {
  console.log("TEST SERVER RUNNING ON 3000");
});
