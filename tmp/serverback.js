const http = require("http");
const { createCanvas } = require("skia-canvas");
const fs = require("fs").promises;
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000; 
const IMG_DIR = path.join(process.cwd(), "tmp", "images");
const IMAGES = new Map(); // Tracks image ID -> filename

// Ensure directory exists
(async () => {
  await fs.mkdir(IMG_DIR, { recursive: true });
})();

function getJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => {
      data += chunk;
      if (data.length > 1e6) req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function drawRoundedBar(ctx, x, y, width, height, pct, fillColor, bgColor) {
  const radius = height / 2;
  const fillWidth = Math.max(radius, width * pct);

  ctx.fillStyle = bgColor;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, fillWidth, height, radius);
  ctx.clip();
  ctx.fillStyle = fillColor;
  ctx.fillRect(x, y, width, height);
  ctx.restore();
}

function drawLabel(ctx, text, x, y) {
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 16px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y);
}

async function generateImage(health, stamina, maxHealth = 100, maxStamina = 100) {
  const width = 500;
  const height = 180;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const healthPct = clamp(health / maxHealth, 0, 1);
  const staminaPct = clamp(stamina / maxStamina, 0, 1);

  ctx.fillStyle = "#151515";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 20px Arial";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  ctx.fillText(`Health ${health}/${maxHealth}`, 24, 38);
  drawRoundedBar(ctx, 24, 48, 452, 28, healthPct, healthPct > 0.5 ? "#22c55e" : healthPct > 0.25 ? "#f59e0b" : "#ef4444", "#333333");
  drawLabel(ctx, `${Math.round(healthPct * 100)}%`, 250, 62);

  ctx.fillText(`Stamina ${stamina}/${maxStamina}`, 24, 108);
  drawRoundedBar(ctx, 24, 118, 452, 28, staminaPct, "#3b82f6", "#333333");
  drawLabel(ctx, `${Math.round(staminaPct * 100)}%`, 250, 132);

  const id = crypto.randomUUID();
  const filename = `${id}.png`;
  const filepath = path.join(IMG_DIR, filename);

  await fs.writeFile(filepath, canvas.toBuffer("image/png"));
  IMAGES.set(id, filepath);

  return id;
}

const server = http.createServer(async (req, res) => {
  // Serve image by ID
  if (req.method === "GET" && req.url.startsWith("/img/")) {
    const id = req.url.slice(5);
    const filepath = IMAGES.get(id);
    if (!filepath) {
      res.writeHead(404, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Image not found" }));
    }

    try {
      const img = await fs.readFile(filepath);
      res.writeHead(200, {
        "Content-Type": "image/png",
        "Content-Length": img.length,
        "Cache-Control": "public, max-age=3600" // Cache for 1 hour
      });
      res.end(img);
      // Optional: cleanup after serving (uncomment to delete after use)
      // await fs.unlink(filepath);
      // IMAGES.delete(id);
    } catch {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Image error" }));
    }
    return;
  }

  // POST /bars
  if (req.method === "POST" && req.url === "/bars") {
    try {
      const body = await getJsonBody(req);
      const health = Number(body.health ?? 100);
      const stamina = Number(body.stamina ?? 100);
      const maxHealth = Number(body.maxHealth ?? 100);
      const maxStamina = Number(body.maxStamina ?? 100);

      if (
        !Number.isFinite(health) ||
        !Number.isFinite(stamina) ||
        !Number.isFinite(maxHealth) ||
        !Number.isFinite(maxStamina) ||
        maxHealth <= 0 ||
        maxStamina <= 0
      ) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ success: false, error: "Invalid input values" }));
      }

      const imageId = await generateImage(health, stamina, maxHealth, maxStamina);

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        success: true,
        health,
        stamina,
        maxHealth,
        maxStamina,
        healthPercent: Math.round((clamp(health / maxHealth, 0, 1)) * 100),
        staminaPercent: Math.round((clamp(stamina / maxStamina, 0, 1)) * 100),
        imageUrl: `http://localhost:${PORT}/img/${imageId}`
      }));
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: "Invalid JSON body" }));
    }
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ success: false, error: "Not found" }));
});

const actualPort = process.env.PORT || 3000;
server.listen(actualPort, '0.0.0.0', () => {
  console.log(`Server running on port ${actualPort}`);
});
