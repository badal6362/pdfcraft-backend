const express = require("express");
const multer = require("multer");
const { PDFDocument } = require("pdf-lib");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const { spawn } = require("child_process");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* =========================
   GHOSTSCRIPT (CROSS-PLATFORM)
========================= */
const GS_PATH = process.platform === "win32"
  ? "C:\\Program Files\\gs\\gs10.06.0\\bin\\gswin64c.exe"
  : "gs";

/* =========================
   PATHS & DIRECTORIES
========================= */
const uploadDir = path.resolve(__dirname, "uploads");
const outputDir = path.resolve(__dirname, "output");

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

/* =========================
   MULTER CONFIG (10 MB)
========================= */
const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 10 * 1024 * 1024 }
});

/* =========================
   MERGE PDF
========================= */
app.post("/merge", upload.array("pdfs"), async (req, res) => {
  try {
    if (!req.files || req.files.length < 2) {
      return res.status(400).send("Upload at least 2 PDF files");
    }

    const mergedPdf = await PDFDocument.create();

    for (const file of req.files) {
      const bytes = fs.readFileSync(file.path);
      const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      pages.forEach(p => mergedPdf.addPage(p));
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    }

    const outputPath = path.join(outputDir, `merged-${Date.now()}.pdf`);
    fs.writeFileSync(outputPath, await mergedPdf.save());

    res.download(outputPath, () => {
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    });

  } catch (err) {
    console.error("MERGE ERROR:", err);
    res.status(500).send("PDF merge failed");
  }
});

/* =========================
   COMPRESS PDF (FIXED)
========================= */
app.post("/compress", upload.single("pdf"), (req, res) => {
  let responded = false;

  try {
    if (!req.file) return res.status(400).send("No PDF uploaded");

    const inputPath = req.file.path;
    const outputPath = path.join(outputDir, `compressed-${Date.now()}.pdf`);

    const level = req.body.level || "medium";
    const map = {
      low: "/printer",
      medium: "/ebook",
      high: "/screen"
    };

    const args = [
      "-sDEVICE=pdfwrite",
      "-dCompatibilityLevel=1.4",
      `-dPDFSETTINGS=${map[level] || "/ebook"}`,
      "-dNOPAUSE",
      "-dQUIET",
      "-dBATCH",
      `-sOutputFile=${outputPath}`,
      inputPath
    ];

    const gs = spawn(GS_PATH, args);

    gs.on("error", err => {
      console.error("GHOSTSCRIPT ERROR:", err);
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
      if (!responded) {
        responded = true;
        res.status(500).send("Compression failed");
      }
    });

    gs.on("close", code => {
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);

      if (code !== 0 || !fs.existsSync(outputPath)) {
        if (!responded) {
          responded = true;
          return res.status(500).send("Compression failed");
        }
        return;
      }

      if (!responded) {
        responded = true;
        res.download(outputPath, () => {
          if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        });
      }
    });

  } catch (err) {
    console.error("COMPRESS ERROR:", err);
    if (!responded) {
      responded = true;
      res.status(500).send("Compression failed");
    }
  }
});

/* =========================
   SPLIT PDF
========================= */
app.post("/split", upload.single("pdf"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).send("No PDF uploaded");

    const range = req.body.range;
    if (!/^\d+-\d+$/.test(range)) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).send("Invalid page range");
    }

    const [s, e] = range.split("-").map(n => parseInt(n, 10) - 1);

    const srcPdf = await PDFDocument.load(
      fs.readFileSync(req.file.path),
      { ignoreEncryption: true }
    );

    if (e >= srcPdf.getPageCount()) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).send("Page range exceeds document length");
    }

    const outPdf = await PDFDocument.create();
    const pages = await outPdf.copyPages(
      srcPdf,
      Array.from({ length: e - s + 1 }, (_, i) => s + i)
    );
    pages.forEach(p => outPdf.addPage(p));

    const outPath = path.join(outputDir, `split-${Date.now()}.pdf`);
    fs.writeFileSync(outPath, await outPdf.save());

    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

    res.download(outPath, () => {
      if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
    });

  } catch (err) {
    console.error("SPLIT ERROR:", err);
    res.status(500).send("PDF split failed");
  }
});

/* =========================
   DOC TO PDF (FIXED)
========================= */
app.post("/doc-to-pdf", upload.single("doc"), (req, res) => {
  let responded = false;

  try {
    if (!req.file) {
      return res.status(400).send("No document uploaded");
    }

    const inputPath = req.file.path;
    const outputFile = `converted-${Date.now()}.pdf`;
    const outputPath = path.join(outputDir, outputFile);

    // IMPORTANT: Docker/Linux uses `libreoffice`
    const args = [
      "--headless",
      "--convert-to", "pdf",
      "--outdir", outputDir,
      inputPath
    ];

    const lo = spawn("libreoffice", args);

    lo.on("error", (err) => {
      console.error("LIBREOFFICE ERROR:", err);
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
      if (!responded) {
        responded = true;
        res.status(500).send("Conversion failed");
      }
    });

    lo.on("close", () => {
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);

      // Find the generated PDF (LibreOffice keeps original filename)
      const files = fs.readdirSync(outputDir);
      const generated = files.find(f =>
        f.endsWith(".pdf") && f.includes(path.basename(inputPath))
      );

      if (!generated) {
        if (!responded) {
          responded = true;
          return res.status(500).send("Conversion failed");
        }
        return;
      }

      const generatedPath = path.join(outputDir, generated);

      fs.renameSync(generatedPath, outputPath);

      if (!responded) {
        responded = true;
        res.download(outputPath, outputFile, () => {
          if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        });
      }
    });

  } catch (err) {
    console.error("DOC TO PDF ERROR:", err);
    if (!responded) {
      responded = true;
      res.status(500).send("Conversion failed");
    }
  }
});

/* =========================
   START SERVER
========================= */
console.log("✅ SPLIT ROUTE LOADED");

app.listen(3000, () => {
  console.log("Backend running at http://localhost:3000");
});
