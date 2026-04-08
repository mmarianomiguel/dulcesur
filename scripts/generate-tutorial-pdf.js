const { jsPDF } = require("jspdf");
const path = require("path");
const fs = require("fs");

const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
const W = 210;
const H = 297;
const M = 20;
const CW = W - 2 * M;

const PRIMARY = [41, 128, 185];
const DARK = [33, 33, 33];
const GRAY = [120, 120, 120];
const LIGHT_GRAY = [200, 200, 200];
const WHITE = [255, 255, 255];
const BG_LIGHT = [245, 247, 250];
const GREEN = [39, 174, 96];
const ORANGE = [230, 140, 20];
const ANDROID_GREEN = [61, 174, 73];
const APPLE_DARK = [50, 50, 50];

let y = 0;

function setColor(c) { pdf.setTextColor(c[0], c[1], c[2]); }
function setFill(c) { pdf.setFillColor(c[0], c[1], c[2]); }
function setDraw(c) { pdf.setDrawColor(c[0], c[1], c[2]); }

function roundedRect(x, y, w, h, r, fill, stroke) {
  if (fill) setFill(fill);
  if (stroke) setDraw(stroke);
  pdf.roundedRect(x, y, w, h, r, r, fill ? (stroke ? "FD" : "F") : "S");
}

function stepBox(stepNum, title, description, yPos) {
  // Measure title
  pdf.setFontSize(11);
  pdf.setFont("helvetica", "bold");
  const titleLines = pdf.splitTextToSize(title, CW - 22);
  const titleH = titleLines.length * 5;

  // Measure description
  pdf.setFontSize(9);
  pdf.setFont("helvetica", "normal");
  const descLines = pdf.splitTextToSize(description, CW - 22);
  const descH = descLines.length * 4.2;

  const paddingTop = 6;
  const gapTitleDesc = 2;
  const paddingBottom = 5;
  const boxH = paddingTop + titleH + gapTitleDesc + descH + paddingBottom;

  roundedRect(M, yPos, CW, boxH, 3, BG_LIGHT, null);

  // Number circle
  setFill(PRIMARY);
  pdf.circle(M + 8, yPos + paddingTop + 3.5, 5, "F");
  pdf.setFontSize(11);
  pdf.setFont("helvetica", "bold");
  setColor(WHITE);
  pdf.text(String(stepNum), M + 8, yPos + paddingTop + 4.7, { align: "center" });

  // Title
  pdf.setFontSize(11);
  pdf.setFont("helvetica", "bold");
  setColor(DARK);
  pdf.text(titleLines, M + 16, yPos + paddingTop + 4);

  // Description
  pdf.setFontSize(9);
  pdf.setFont("helvetica", "normal");
  setColor(GRAY);
  pdf.text(descLines, M + 16, yPos + paddingTop + titleH + gapTitleDesc + 3.5);

  return boxH + 4;
}

function tipBox(text, yPos, label) {
  pdf.setFontSize(8.5);
  pdf.setFont("helvetica", "normal");
  const lines = pdf.splitTextToSize(text, CW - 14);
  const boxH = Math.max(16, 8 + lines.length * 4.2 + 4);

  roundedRect(M, yPos, CW, boxH, 3, [255, 248, 225], ORANGE);

  pdf.setFontSize(8);
  pdf.setFont("helvetica", "bold");
  setColor(ORANGE);
  pdf.text(label || "TIP", M + 5, yPos + 6);

  pdf.setFontSize(8.5);
  pdf.setFont("helvetica", "normal");
  setColor(DARK);
  pdf.text(lines, M + 5, yPos + 11);

  return boxH + 5;
}

// Load logo (high-res PNG 790x577)
let logoData = null;
const logoPath = path.join(__dirname, "..", "public", "logo-dulcesur-full.png");
if (fs.existsSync(logoPath)) {
  const logoBuffer = fs.readFileSync(logoPath);
  logoData = "data:image/png;base64," + logoBuffer.toString("base64");
}

// ═══════════════════════════════════════════
// PAGE 1 - COVER
// ═══════════════════════════════════════════

// Soft background
setFill([245, 248, 252]);
pdf.rect(0, 0, W, H, "F");

// Top decorative band - wide rounded accent
setFill(PRIMARY);
pdf.rect(0, 0, W, 8, "F");

// Bottom decorative band
setFill(PRIMARY);
pdf.rect(0, H - 8, W, 8, "F");

// Decorative circles (subtle background elements)
pdf.setGState(new pdf.GState({ opacity: 0.04 }));
setFill(PRIMARY);
pdf.circle(30, 60, 40, "F");
pdf.circle(185, 240, 50, "F");
pdf.circle(170, 50, 25, "F");
pdf.setGState(new pdf.GState({ opacity: 1 }));

y = 35;

// Logo (790x577 original, keep aspect ratio) - big and centered
if (logoData) {
  const logoW = 80;
  const logoH = logoW * (577 / 790);
  pdf.addImage(logoData, "PNG", W / 2 - logoW / 2, y, logoW, logoH);
  y += logoH + 12;
} else {
  y += 40;
}

// Tagline
pdf.setFontSize(13);
pdf.setFont("helvetica", "normal");
setColor(GRAY);
pdf.text("Tu tienda mayorista, ahora en tu celular", W / 2, y, { align: "center" });
y += 18;

// Main title card
roundedRect(M, y, CW, 50, 6, WHITE, null);
// Add subtle shadow effect
pdf.setGState(new pdf.GState({ opacity: 0.06 }));
setFill(DARK);
roundedRect(M + 1, y + 1.5, CW, 50, 6, DARK, null);
pdf.setGState(new pdf.GState({ opacity: 1 }));
roundedRect(M, y, CW, 50, 6, WHITE, null);

// Blue left accent bar inside card
setFill(PRIMARY);
pdf.roundedRect(M, y, 4, 50, 3, 3, "F");

pdf.setFontSize(22);
pdf.setFont("helvetica", "bold");
setColor(DARK);
pdf.text("Como instalar la app", M + 14, y + 18, { align: "left" });

pdf.setFontSize(11);
pdf.setFont("helvetica", "normal");
setColor(GRAY);
pdf.text("Guia rapida paso a paso para Android y iPhone", M + 14, y + 28, { align: "left" });

pdf.setFontSize(9);
setColor(PRIMARY);
pdf.text("Solo te lleva 1 minuto!", M + 14, y + 38, { align: "left" });

y += 60;

// Benefits row - 4 items horizontal
const benefitData = [
  { icon: ">>", title: "Acceso\ndirecto", color: [52, 152, 219] },
  { icon: "!!", title: "Notifi-\ncaciones", color: [231, 76, 60] },
  { icon: "~0", title: "Super\nliviana", color: [46, 204, 113] },
  { icon: "OK", title: "Siempre\nal dia", color: [155, 89, 182] },
];

const bCardW = (CW - 12) / 4;
benefitData.forEach((b, i) => {
  const bx = M + i * (bCardW + 4);

  roundedRect(bx, y, bCardW, 40, 4, WHITE, null);

  // Colored circle
  setFill(b.color);
  pdf.circle(bx + bCardW / 2, y + 13, 7, "F");

  // Icon text
  pdf.setFontSize(8);
  pdf.setFont("helvetica", "bold");
  setColor(WHITE);
  pdf.text(b.icon, bx + bCardW / 2, y + 14.2, { align: "center" });

  // Label
  pdf.setFontSize(8);
  pdf.setFont("helvetica", "bold");
  setColor(DARK);
  const tLines = b.title.split("\n");
  tLines.forEach((l, li) => {
    pdf.text(l, bx + bCardW / 2, y + 26 + li * 4, { align: "center" });
  });
});

y += 50;

// URL section - prominent
roundedRect(M, y, CW, 40, 6, PRIMARY, null);

pdf.setFontSize(10);
pdf.setFont("helvetica", "normal");
setColor([180, 215, 240]);
pdf.text("Ingresa desde tu navegador a:", W / 2, y + 11, { align: "center" });

pdf.setFontSize(24);
pdf.setFont("helvetica", "bold");
setColor(WHITE);
pdf.text("dulcesur.com", W / 2, y + 25, { align: "center" });

pdf.setFontSize(8.5);
pdf.setFont("helvetica", "normal");
setColor([180, 215, 240]);
pdf.text("Chrome en Android   |   Safari en iPhone", W / 2, y + 34, { align: "center" });

y += 48;

// Bottom CTA
pdf.setFontSize(10);
pdf.setFont("helvetica", "normal");
setColor(GRAY);
pdf.text("En las siguientes paginas te explicamos como hacerlo", W / 2, y, { align: "center" });

// Arrow down
y += 6;
setFill(PRIMARY);
pdf.triangle(W / 2 - 5, y, W / 2 + 5, y, W / 2, y + 6, "F");
pdf.setGState(new pdf.GState({ opacity: 0.4 }));
pdf.triangle(W / 2 - 4, y + 5, W / 2 + 4, y + 5, W / 2, y + 10, "F");
pdf.setGState(new pdf.GState({ opacity: 1 }));


// ═══════════════════════════════════════════
// PAGE 2 - ANDROID
// ═══════════════════════════════════════════
pdf.addPage();
y = 0;

setFill(ANDROID_GREEN);
pdf.rect(0, 0, W, 40, "F");
pdf.setFontSize(22);
pdf.setFont("helvetica", "bold");
setColor(WHITE);
pdf.text("Instalacion en Android", W / 2, 17, { align: "center" });
pdf.setFontSize(12);
pdf.setFont("helvetica", "normal");
pdf.text("Usando Google Chrome", W / 2, 30, { align: "center" });

y = 50;

y += stepBox(1, "Abri Google Chrome",
  "Busca el icono de Chrome en tu celular (circulo de colores rojo, amarillo, verde y azul) y tocalo.", y);

y += stepBox(2, "Escribi la direccion",
  "Toca la barra de arriba. Escribi dulcesur.com y toca \"Ir\" o la tecla Enter.", y);

y += stepBox(3, "Toca el menu (3 puntitos)",
  "Arriba a la derecha vas a ver tres puntitos verticales. Tocalos para abrir el menu.", y);

// Visual hint
roundedRect(M + 10, y, CW - 20, 18, 3, [240, 240, 240], null);
setFill(DARK);
const dotX = W - M - 20;
pdf.circle(dotX, y + 6, 1.3, "F");
pdf.circle(dotX, y + 9.5, 1.3, "F");
pdf.circle(dotX, y + 13, 1.3, "F");
setDraw(PRIMARY);
pdf.setLineWidth(0.5);
pdf.line(dotX - 10, y + 9.5, dotX - 3, y + 9.5);
pdf.line(dotX - 5, y + 8, dotX - 3, y + 9.5);
pdf.line(dotX - 5, y + 11, dotX - 3, y + 9.5);
pdf.setLineWidth(0.2);
pdf.setFontSize(8.5);
setColor(GRAY);
pdf.text("Busca estos 3 puntitos arriba a la derecha", M + 15, y + 10);
y += 23;

y += stepBox(4, "Toca \"Instalar aplicacion\"",
  "En el menu que se abrio, busca la opcion que dice \"Instalar aplicacion\" o \"Agregar a pantalla de inicio\". Puede que tengas que bajar un poco.", y);

y += stepBox(5, "Confirma la instalacion",
  "Aparece un cartel preguntando si queres instalar. Toca \"Instalar\".", y);

y += stepBox(6, "Listo!",
  "El icono de DulceSur aparece en tu pantalla de inicio. Tocalo para entrar a la tienda.", y);

y += 2;

// Success
roundedRect(M, y, CW, 20, 4, [234, 250, 241], null);
pdf.setFontSize(11);
pdf.setFont("helvetica", "bold");
setColor(GREEN);
pdf.text("Ya tenes la app instalada!", W / 2, y + 8, { align: "center" });
pdf.setFontSize(9);
pdf.setFont("helvetica", "normal");
setColor(DARK);
pdf.text("Podes cerrar Chrome y usar el icono de DulceSur.", W / 2, y + 14.5, { align: "center" });
y += 25;

y += tipBox(
  "Si no aparece la opcion, asegurate de estar usando Chrome (no Samsung Internet ni otro). Proba cerrando y abriendo Chrome de nuevo.",
  y,
  "NO TE APARECE?"
);


// ═══════════════════════════════════════════
// PAGE 3 - IPHONE
// ═══════════════════════════════════════════
pdf.addPage();
y = 0;

setFill(APPLE_DARK);
pdf.rect(0, 0, W, 40, "F");
pdf.setFontSize(22);
pdf.setFont("helvetica", "bold");
setColor(WHITE);
pdf.text("Instalacion en iPhone / iPad", W / 2, 17, { align: "center" });
pdf.setFontSize(12);
pdf.setFont("helvetica", "normal");
pdf.text("Usando Safari", W / 2, 30, { align: "center" });

y = 50;

y += stepBox(1, "Abri Safari",
  "Safari es el navegador de Apple (icono de brujula azul). Abrilo tocando su icono.", y);

y += stepBox(2, "Escribi la direccion",
  "Toca la barra de direccion. Escribi dulcesur.com y toca \"Ir\".", y);

y += stepBox(3, "Toca el boton de Compartir",
  "Busca el icono de un cuadrado con una flecha para arriba. Generalmente esta abajo en el centro de la pantalla.", y);

// Visual hint for share
roundedRect(M + 10, y, CW - 20, 20, 3, [240, 240, 240], null);
const shareX = W / 2;
const shareY = y + 11;
setDraw(PRIMARY);
pdf.setLineWidth(0.6);
pdf.rect(shareX - 5, shareY - 2, 10, 8, "S");
pdf.line(shareX, shareY + 2, shareX, shareY - 7);
pdf.line(shareX - 2.5, shareY - 5, shareX, shareY - 7);
pdf.line(shareX + 2.5, shareY - 5, shareX, shareY - 7);
pdf.setLineWidth(0.2);
pdf.setFontSize(8.5);
setColor(GRAY);
pdf.text("Este es el icono de Compartir", M + 15, y + 17);
y += 25;

y += stepBox(4, "Toca \"Agregar a inicio\"",
  "En el menu, desplaza hacia abajo y busca \"Agregar a pantalla de inicio\". Tocalo.", y);

y += stepBox(5, "Confirma tocando \"Agregar\"",
  "Te muestra el nombre de la app. No cambies nada. Toca \"Agregar\" arriba a la derecha.", y);

y += stepBox(6, "Listo!",
  "El icono de DulceSur aparece en tu pantalla de inicio. Tocalo para entrar.", y);

y += 2;

// Success
roundedRect(M, y, CW, 20, 4, [234, 250, 241], null);
pdf.setFontSize(11);
pdf.setFont("helvetica", "bold");
setColor(GREEN);
pdf.text("Ya tenes la app en tu iPhone!", W / 2, y + 8, { align: "center" });
pdf.setFontSize(9);
pdf.setFont("helvetica", "normal");
setColor(DARK);
pdf.text("Usa el icono de DulceSur para acceder rapido.", W / 2, y + 14.5, { align: "center" });
y += 25;

y += tipBox(
  "En iPhone SOLO funciona con Safari. Chrome u otros navegadores no permiten instalar apps web en iPhone.",
  y,
  "MUY IMPORTANTE"
);


// ═══════════════════════════════════════════
// PAGE 4 - NOTIFICACIONES + FAQ
// ═══════════════════════════════════════════
pdf.addPage();
y = 0;

setFill(PRIMARY);
pdf.rect(0, 0, W, 40, "F");
pdf.setFontSize(22);
pdf.setFont("helvetica", "bold");
setColor(WHITE);
pdf.text("Activar Notificaciones", W / 2, 17, { align: "center" });
pdf.setFontSize(12);
pdf.setFont("helvetica", "normal");
setColor([180, 215, 240]);
pdf.text("Enterate cuando tu pedido esta en camino", W / 2, 30, { align: "center" });

y = 50;

pdf.setFontSize(10);
pdf.setFont("helvetica", "normal");
setColor(DARK);
pdf.text("Una vez instalada la app, activa las notificaciones asi:", M, y);
y += 8;

y += stepBox(1, "Abri la app de DulceSur",
  "Toca el icono de DulceSur en tu pantalla.", y);

y += stepBox(2, "Entra a tu cuenta",
  "Toca \"Mi cuenta\" (icono de persona). Si no tenes cuenta, registrate.", y);

y += stepBox(3, "Anda a Notificaciones",
  "Dentro de tu cuenta, toca \"Notificaciones\".", y);

y += stepBox(4, "Activa las notificaciones",
  "Toca el boton para activar. Tu celular te pide permiso: toca \"Permitir\".", y);

y += stepBox(5, "Elegi cuales recibir",
  "Podes activar o desactivar cada tipo: pedidos, ofertas, novedades, etc.", y);

y += 2;

roundedRect(M, y, CW, 16, 4, [234, 250, 241], null);
pdf.setFontSize(10);
pdf.setFont("helvetica", "bold");
setColor(GREEN);
pdf.text("Listo! Ya vas a recibir notificaciones.", W / 2, y + 10, { align: "center" });
y += 23;

// FAQ
setDraw(LIGHT_GRAY);
pdf.line(M, y, W - M, y);
y += 8;

pdf.setFontSize(15);
pdf.setFont("helvetica", "bold");
setColor(PRIMARY);
pdf.text("Preguntas frecuentes", M, y);
y += 10;

const faqs = [
  ["Ocupa mucho espacio la app?", "No, es super liviana. Casi no usa espacio en tu celular."],
  ["Puedo desinstalarla?", "Si! Mantene presionado el icono y elegi Eliminar o Desinstalar."],
  ["Funciona sin internet?", "Necesitas internet para ver productos y hacer pedidos."],
  ["No me aparece la opcion de instalar", "Asegurate de usar Chrome (Android) o Safari (iPhone)."],
  ["Puedo desactivar notificaciones?", "Si, desde Mi Cuenta > Notificaciones desactiva las que quieras."],
  ["Se descarga de Play Store o App Store?", "No! Se instala directo desde el navegador, sin tienda de apps."],
];

faqs.forEach(([q, a]) => {
  // Check if we need a new page
  if (y > H - 30) {
    pdf.addPage();
    y = 20;
  }

  pdf.setFontSize(10);
  pdf.setFont("helvetica", "bold");
  setColor(DARK);
  pdf.text(q, M + 2, y);
  y += 5;

  pdf.setFontSize(9);
  pdf.setFont("helvetica", "normal");
  setColor(GRAY);
  const aLines = pdf.splitTextToSize(a, CW - 4);
  pdf.text(aLines, M + 2, y);
  y += aLines.length * 4.5 + 6;
});

// Contact footer on last page
y += 4;
roundedRect(M, y, CW, 18, 4, BG_LIGHT, null);
pdf.setFontSize(9);
pdf.setFont("helvetica", "bold");
setColor(PRIMARY);
pdf.text("Necesitas ayuda?", W / 2, y + 6, { align: "center" });
pdf.setFontSize(8.5);
pdf.setFont("helvetica", "normal");
setColor(GRAY);
pdf.text("Escribinos por WhatsApp al 1162991571 o visitanos en dulcesur.com", W / 2, y + 12, { align: "center" });

// Page footers
const pageCount = pdf.getNumberOfPages();
for (let i = 1; i <= pageCount; i++) {
  pdf.setPage(i);
  pdf.setFontSize(7.5);
  setColor(LIGHT_GRAY);
  pdf.text("DulceSur  |  dulcesur.com", W / 2, H - 8, { align: "center" });
}

// Save
const outputPath = path.join(__dirname, "..", "public", "tutorial-instalacion-app.pdf");
fs.writeFileSync(outputPath, Buffer.from(pdf.output("arraybuffer")));
console.log("PDF generado: " + outputPath);
