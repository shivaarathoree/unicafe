import * as Phaser from "phaser";
import { TILE_SIZE } from "./types";

const ROOM_W = 22;
const ROOM_H = 18;
const PX_W = ROOM_W * TILE_SIZE;
const PX_H = ROOM_H * TILE_SIZE;

// Luxurious & Rich Café Vibe - Deep Amber, Marble, Velvet Emerald, Brass Gold, and Soft Cozy Vignettes
const C = {
  // Walls & Trim
  wall:         0x1a242f, // Deep slate/navy luxurious wall
  wallTrim:     0xd4af37, // Metallic brass gold trim
  wallShadow:   0x0f161e, // Deep dark wall shadow
  
  // Floor (Premium Parquet Oak & Herringbone texture)
  floorLight:   0xd2b48c, // Warm tan oak wood
  floorDark:    0xc19a6b, // Deep rich oak shade
  floorLine:    0x8e704c, // Wood grain lines
  
  // Windows & Glare
  windowGlass:  0xabd9e9, // High-fidelity sky glass
  windowFrame:  0x34495e, // Slate grey framing
  glare:        0xffffff,
  
  // Elegant Velvet Emerald Sofas & Armchairs
  sofaVelvet:   0x097969, // Rich Emerald Green
  sofaShadow:   0x043e36, // Deep emerald shadow
  cushionGold:  0xe5a93b, // Velvet Gold accent cushions
  
  // Marble & Mahogany Tables
  tableMarble:  0xf5f6f8, // Polished white marble table top
  tableMahogany:0x4a2c11, // Rich dark mahogany wood
  tableGoldRim: 0xd4af37, // Premium brass/gold rim
  
  // Elegant Blue Velvet Chairs (Matching finalview)
  chairBlue:    0x1f4e79, // Rich royal blue velvet
  chairSeat:    0x2c6ba0, // Bright royal blue highlight
  chairBrass:   0xcda250, // Brass chair legs
  
  // Elegant Lighting (Lamps casting beautiful warm alpha glows)
  lampBrass:    0xd4af37, // Polished brass fixture
  lampGlow:     0xff9900, // Warm amber glowing bulb
  lightBeam:    0xfff2e6, // Soft light filtering through windows
  
  // Decorative items
  potTerra:     0xc86432, // Terracotta plant pots
  leafGreen:    0x1e5631, // Rich evergreen leaves
  leafLight:    0x4c9a2a, // Soft ivy highlight
  bookSpine1:   0xa32638, // Rich crimson
  bookSpine2:   0x224c75, // Deep sapphire
  bookSpine3:   0x1b4d3e, // Forest green
  bookSpine4:   0xcfa031, // Ochre gold
  
  shadow:       0x000000,
};

interface CollisionBox { x: number; y: number; w: number; h: number }

export class MapManager {
  private scene: Phaser.Scene;
  private solids: Phaser.Physics.Arcade.StaticGroup | null = null;
  private collisionBoxes: CollisionBox[] = [];
  private graphics: Phaser.GameObjects.Graphics | null = null;

  constructor(scene: Phaser.Scene) { this.scene = scene; }
  preload() {}

  create() {
    this.solids = this.scene.physics.add.staticGroup();
    this.graphics = this.scene.add.graphics();
    this.graphics.setDepth(0);
    this.drawRoom();
    this.buildColliders();
  }

  private px(tx: number) { return tx * TILE_SIZE; }
  private py(ty: number) { return ty * TILE_SIZE; }

  private addCollider(tx: number, ty: number, tw: number, th: number) {
    this.collisionBoxes.push({ x: this.px(tx), y: this.py(ty), w: tw * TILE_SIZE, h: th * TILE_SIZE });
  }

  private drawRoom() {
    const g = this.graphics!;

    // ── 1. PREMIUM PARQUET FLOORS ──────────────────────────────────────────
    g.fillStyle(C.floorLight);
    g.fillRect(0, this.py(2), PX_W, PX_H - this.py(2));

    // Dynamic Parquet / Herringbone Floor Pattern
    for (let r = 2; r < ROOM_H; r++) {
      for (let c = 0; c < ROOM_W; c++) {
        // Draw wood slats alternative colors for premium feel
        if ((r + c) % 2 === 0) {
          g.fillStyle(C.floorDark, 0.45);
          g.fillRect(this.px(c), this.py(r), TILE_SIZE, TILE_SIZE);
        }
        // Subtle vertical wood plank lines inside each tile
        g.fillStyle(C.floorLine, 0.15);
        g.fillRect(this.px(c) + 6, this.py(r), 1, TILE_SIZE);
        g.fillRect(this.px(c) + 18, this.py(r), 1, TILE_SIZE);
        g.fillRect(this.px(c) + 26, this.py(r), 1, TILE_SIZE);
      }
    }
    
    // Crisp geometric floor grid outlines
    g.lineStyle(1.5, C.floorLine, 0.35);
    for (let r = 2; r <= ROOM_H; r++) {
      g.beginPath(); g.moveTo(0, this.py(r)); g.lineTo(PX_W, this.py(r)); g.strokePath();
    }
    for (let c = 0; c <= ROOM_W; c++) {
      g.beginPath(); g.moveTo(this.px(c), this.py(2)); g.lineTo(this.px(c), PX_H); g.strokePath();
    }

    // ── 2. HIGH-END SLATE ACCENT WALL ──────────────────────────────────────
    g.fillStyle(C.wall);
    g.fillRect(0, 0, PX_W, this.py(2));
    
    // Luxurious Golden Crown Molding & Trim
    g.fillStyle(C.wallTrim);
    g.fillRect(0, this.py(2) - 4, PX_W, 4); // Brass divider line
    g.fillStyle(C.wallShadow, 0.5);
    g.fillRect(0, this.py(2), PX_W, 6);     // Soft wall drop-shadow onto parquet

    // Wall panel lines for architectural premium look
    g.lineStyle(2, C.wallShadow, 0.6);
    for (let c = 1; c < ROOM_W; c += 2) {
      g.beginPath(); g.moveTo(this.px(c), 0); g.lineTo(this.px(c), this.py(2) - 4); g.strokePath();
    }

    // Left and Right Wall pillars
    g.fillStyle(C.wall);
    g.fillRect(0, this.py(2), TILE_SIZE * 0.4, PX_H - this.py(2));
    g.fillRect(PX_W - TILE_SIZE * 0.4, this.py(2), TILE_SIZE * 0.4, PX_H - this.py(2));
    g.fillStyle(C.wallTrim);
    g.fillRect(TILE_SIZE * 0.4, this.py(2), 2, PX_H - this.py(2));
    g.fillRect(PX_W - TILE_SIZE * 0.4 - 2, this.py(2), 2, PX_H - this.py(2));

    // ── 3. PANORAMIC GLASS WINDOWS & NATURAL AMBIENT LIGHT BEAMS ──────────
    this.drawPanoramicWindow(g, 1, 0, 4, 1.8);
    this.drawPanoramicWindow(g, 7, 0, 4, 1.8);
    this.drawPanoramicWindow(g, 13, 0, 4, 1.8);

    // ── 4. MODERN CAFE COUNTER & BAR STATION (The "Controlling Side") ──────
    // A premium dark wood and marble espresso bar at the top right
    this.drawPremiumBarCounter(g, 17, 3, 4.6, 2.5);

    // ── 5. LUXURIOUS VELVET COZY SEATING CORNER (Right Sofa Area) ─────────
    // Premium Chesterfield-style emerald green velvet sofa
    this.drawPremiumSofaChesterfield(g, 14.5, 8.5, 4.2, 2.6);
    // Gold-plated coffee table with the famous pizza box & mugs
    this.drawGoldCoffeeTable(g, 15.3, 11.5, 2.6, 1.4);
    // Two high-end gray velvet lounge armchairs (finalview style)
    this.drawLoungeArmchair(g, 14.8, 14, C.sofaVelvet);
    this.drawLoungeArmchair(g, 18.2, 14, C.sofaVelvet);

    // ── 6. COZY LOUNGE SEATING (Left Area) ─────────────────────────────────
    // Polished white marble circular dining table with elegant velvet chairs
    this.drawPremiumCircularTable(g, 4, 9.5, 1.8);

    // ── 7. ROYAL EMBOSS LOBBY ENTRANCE ─────────────────────────────────────
    this.drawRoyalElevatorDoor(g, 0, 0.1, 0.8, 1.7);

    // ── 8. STYLISH HIGH-END BOOKSHELVES ────────────────────────────────────
    this.drawBespokeBookshelf(g, 1, 3, 3.5, 3.5);

    // ── 9. EXQUISITE INDOOR PLANTS & HANGING GREENERY ──────────────────────
    this.drawIndoorPlant(g, 5.2, 3.5, 0.9);   // Tall fiddle-leaf fig next to books
    this.drawIndoorPlant(g, 13.8, 9.2, 0.75); // Plant nested beside sofa arm
    this.drawIndoorPlant(g, 19.5, 13.8, 0.8); // Plant at the corner of the bar
    this.drawIndoorPlant(g, 0.6, 14.5, 0.85); // Plant welcoming near bottom left

    // ── 10. LUXURY CENTRAL MEETING STATION ─────────────────────────────────
    this.drawMainMeetingStation(g, 7, 6.5, 8, 6.2);

    // ── 11. PREMIUM LIGHTING & REAL-TIME AMBIENT GLOW EFFECTS ──────────────
    // Add warm golden floor lamps that cast actual translucent golden halos
    this.drawCozyGlowingLamp(g, 1.5, 7.5, 3.5);  // Left glow
    this.drawCozyGlowingLamp(g, 12.5, 7.5, 3.0); // Center seating glow
    this.drawCozyGlowingLamp(g, 19.5, 6.5, 3.2); // Right bar glow

    // ── 12. AMBIENT LUXURY VIGNETTE & WARM TONE ENHANCEMENT ────────────────
    const warmVignette = this.scene.add.graphics();
    warmVignette.setDepth(49999);
    // Multi-layered corner shadows to create professional cozy photo depth
    warmVignette.fillStyle(0x0a0c10, 0.15);
    warmVignette.fillRect(0, 0, PX_W, TILE_SIZE * 2.5); // Top wall shadow depth
    warmVignette.fillRect(0, PX_H - TILE_SIZE * 0.8, PX_W, TILE_SIZE * 0.8); // Bottom edge
    
    // Deep vignette corners
    warmVignette.fillStyle(0x000000, 0.08);
    warmVignette.fillRect(0, 0, TILE_SIZE * 1.5, PX_H);
    warmVignette.fillRect(PX_W - TILE_SIZE * 1.5, 0, TILE_SIZE * 1.5, PX_H);
  }

  // ── A. PANORAMIC WINDOW WITH BEAM LIGHTING ────────────────────────────────
  private drawPanoramicWindow(g: Phaser.GameObjects.Graphics, tx: number, ty: number, tw: number, th: number) {
    const wx = this.px(tx), wy = this.py(ty), ww = tw * TILE_SIZE, wh = th * TILE_SIZE;
    
    // Soft glowing light beam casting into the room (diagonal translucent shapes)
    g.fillStyle(C.lightBeam, 0.07);
    g.beginPath();
    g.moveTo(wx, wy + wh);
    g.lineTo(wx + ww, wy + wh);
    g.lineTo(wx + ww + TILE_SIZE * 3, PX_H);
    g.lineTo(wx - TILE_SIZE * 1.5, PX_H);
    g.closePath();
    g.fillPath();

    // High fidelity glass sky
    g.fillStyle(C.windowGlass, 0.9);
    g.fillRect(wx, wy, ww, wh);
    // Drop shadow inside the window pane
    g.fillStyle(C.wallShadow, 0.25);
    g.fillRect(wx, wy, ww, 8);

    // Luxurious gold/brass metal window framework
    g.lineStyle(3, C.windowFrame, 0.95);
    g.strokeRect(wx, wy, ww, wh);
    g.lineStyle(1.5, C.wallTrim, 0.85); // Brass golden frame accent
    g.strokeRect(wx + 2, wy + 2, ww - 4, wh - 4);

    // Architectural Glass divider bars
    g.lineStyle(2, C.windowFrame, 0.85);
    g.beginPath(); g.moveTo(wx + ww / 2, wy); g.lineTo(wx + ww / 2, wy + wh); g.strokePath();
    g.beginPath(); g.moveTo(wx + ww / 4, wy); g.lineTo(wx + ww / 4, wy + wh); g.strokePath();
    g.beginPath(); g.moveTo(wx + (ww * 3) / 4, wy); g.lineTo(wx + (ww * 3) / 4, wy + wh); g.strokePath();

    // Natural sky reflection/glare effect
    g.fillStyle(C.glare, 0.3);
    g.fillRect(wx + 6, wy + 6, ww * 0.25, wh * 0.35);
    g.fillRect(wx + ww/2 + 6, wy + 6, ww * 0.2, wh * 0.3);
  }

  // ── B. ROYAL ELEVATOR ENTRANCE DOOR ──────────────────────────────────────
  private drawRoyalElevatorDoor(g: Phaser.GameObjects.Graphics, tx: number, ty: number, tw: number, th: number) {
    const dx = this.px(tx), dy = this.py(ty), dw = tw * TILE_SIZE, dh = th * TILE_SIZE;
    
    // Drop shadow
    g.fillStyle(C.shadow, 0.2);
    g.fillRect(dx, dy, dw + 4, dh);

    // Premium dark gold/brass door frames
    g.fillStyle(C.wallTrim);
    g.fillRect(dx, dy, dw, dh);
    g.fillStyle(C.wall);
    g.fillRect(dx + 3, dy + 3, dw - 6, dh - 3);

    // Elegantly brushed dark inner door plates
    g.fillStyle(C.wallShadow, 0.95);
    g.fillRect(dx + 6, dy + 6, dw - 12, dh - 6);

    // Brass vertical middle seam divider
    g.fillStyle(C.wallTrim);
    g.fillRect(dx + dw / 2 - 1.5, dy + 6, 3, dh - 6);

    // Glowing modern key card lock indicator
    g.fillStyle(0x00ff00, 0.85); // Safe green access light
    g.fillRect(dx + dw - 10, dy + dh * 0.55, 3, 5);
  }

  // ── C. BESPOKE HIGH-END BOOKSHELF ────────────────────────────────────────
  private drawBespokeBookshelf(g: Phaser.GameObjects.Graphics, tx: number, ty: number, tw: number, th: number) {
    const bx = this.px(tx), by = this.py(ty), bw = tw * TILE_SIZE, bh = th * TILE_SIZE;
    
    // Drop shadow
    g.fillStyle(C.shadow, 0.15);
    g.fillRect(bx + 4, by + 4, bw, bh);

    // Main Mahogany Cabinet Structure
    g.fillStyle(C.tableMahogany);
    g.fillRect(bx, by, bw, bh);
    
    // Polished gold rim lining along cabinet edge
    g.lineStyle(2, C.wallTrim, 0.9);
    g.strokeRect(bx, by, bw, bh);

    const colors = [C.bookSpine1, C.bookSpine2, C.bookSpine3, C.bookSpine4, 0x5a3e2b, 0x8b4513];
    const rows = 3;
    for (let r = 0; r < rows; r++) {
      const ry = by + (r / rows) * bh + 4;
      const rh = bh / rows - 9;
      let bkX = bx + 5;
      let colorIndex = r * 5;
      
      // Pack stylized high-end books inside shelf
      while (bkX < bx + bw - 6) {
        const bkW = 5 + (colorIndex % 4) * 2;
        g.fillStyle(colors[colorIndex % colors.length], 0.95);
        g.fillRect(bkX, ry, bkW, rh);
        
        // Dynamic book top shadow
        g.fillStyle(C.shadow, 0.15);
        g.fillRect(bkX, ry, bkW, 4);

        bkX += bkW + 1;
        colorIndex++;
      }

      // Premium gold frame shelves
      g.fillStyle(C.wallTrim, 0.85);
      g.fillRect(bx, by + ((r + 1) / rows) * bh - 3, bw, 3);
    }
  }

  // ── D. CHESTERFIELD SOFA (EMERALD GREEN VELVET) ──────────────────────────
  private drawPremiumSofaChesterfield(g: Phaser.GameObjects.Graphics, tx: number, ty: number, tw: number, th: number) {
    const sx = this.px(tx), sy = this.py(ty), sw = tw * TILE_SIZE, sh = th * TILE_SIZE;
    
    // Drop shadow
    g.fillStyle(C.shadow, 0.22);
    g.fillRect(sx + 4, sy + 4, sw, sh);

    // Thick Royal Emerald velvet main body frame
    g.fillStyle(C.sofaShadow);
    g.fillRoundedRect(sx, sy, sw, sh, 10);
    g.fillStyle(C.sofaVelvet);
    g.fillRoundedRect(sx + 3, sy + 3, sw - 6, sh - 6, 8);

    // Tufted velvet cushions division
    const c1y = sy + 6;
    const c2y = sy + sh / 2 + 1;
    const cw = sw - 12;
    const ch = sh / 2 - 8;

    g.fillStyle(C.sofaVelvet, 0.85);
    g.fillRoundedRect(sx + 6, c1y, cw, ch, 6);
    g.fillRoundedRect(sx + 6, c2y, cw, ch, 6);

    // Premium golden velvet throw pillows on both sofa corners!
    g.fillStyle(C.cushionGold);
    g.fillRoundedRect(sx + 8, sy + 10, 14, 18, 4);
    g.fillRoundedRect(sx + sw - 22, sy + 10, 14, 18, 4);
    g.lineStyle(1, C.wallTrim, 0.6);
    g.strokeRoundedRect(sx + 8, sy + 10, 14, 18, 4);
    g.strokeRoundedRect(sx + sw - 22, sy + 10, 14, 18, 4);

    // Gold brass legs detail
    g.fillStyle(C.wallTrim);
    g.fillCircle(sx + 6, sy + sh - 2, 3);
    g.fillCircle(sx + sw - 6, sy + sh - 2, 3);
  }

  // ── E. GOLD COFFEE TABLE WITH PIZZA ─────────────────────────────────────
  private drawGoldCoffeeTable(g: Phaser.GameObjects.Graphics, tx: number, ty: number, tw: number, th: number) {
    const cx = this.px(tx), cy = this.py(ty), cw = tw * TILE_SIZE, ch = th * TILE_SIZE;
    
    // Soft transparent table shadow
    g.fillStyle(C.shadow, 0.16);
    g.fillRect(cx + 3, cy + 3, cw, ch);

    // Polished Brass Metal Frame and Legs
    g.fillStyle(C.wallTrim);
    g.fillRect(cx, cy, cw, ch);
    
    // Tempered smoky high-end glass table surface
    g.fillStyle(0x2a3e36, 0.9);
    g.fillRect(cx + 2, cy + 2, cw - 4, ch - 4);

    // The iconic pizza box (finalview style detail!)
    const pzW = cw - 12;
    const pzH = ch - 8;
    g.fillStyle(0xffffff); // Crisp white cardboard box
    g.fillRect(cx + 6, cy + 4, pzW, pzH);
    g.lineStyle(1.5, 0xc0c0c0, 0.7);
    g.strokeRect(cx + 6, cy + 4, pzW, pzH);
    
    // Delicious pizza slice details inside the box
    g.fillStyle(0xe89b3a); // Cheese
    g.fillCircle(cx + cw / 2, cy + ch / 2, ch * 0.25);
    g.lineStyle(1, 0x8b0000, 0.85); // Crust
    g.strokeCircle(cx + cw / 2, cy + ch / 2, ch * 0.25);

    // Steaming coffee mug next to the box
    g.fillStyle(C.cushionGold);
    g.fillCircle(cx + 5, cy + 6, 3);
    g.fillStyle(0xffffff, 0.7);
    g.fillRect(cx + 4, cy + 3, 2, 3); // Steam trace
  }

  // ── F. PREMIUM LOUNGE ARMCHAIRS ──────────────────────────────────────────
  private drawLoungeArmchair(g: Phaser.GameObjects.Graphics, cx: number, cy: number, velvetColor: number) {
    const w = TILE_SIZE * 0.9, h = TILE_SIZE * 0.9;
    
    // Drop shadow
    g.fillStyle(C.shadow, 0.15);
    g.fillRect(cx - w / 2 + 2, cy - h / 2 + 2, w, h);

    // Seat frame
    g.fillStyle(C.sofaShadow);
    g.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 6);
    g.fillStyle(velvetColor);
    g.fillRoundedRect(cx - w / 2 + 2, cy - h / 2 + 2, w - 4, h - 4, 5);

    // Armrests highlights
    g.fillStyle(velvetColor, 0.6);
    g.fillRect(cx - w / 2 + 2, cy - h / 2 + 2, 4, h - 4);
    g.fillRect(cx + w / 2 - 6, cy - h / 2 + 2, 4, h - 4);

    // Elegant gold leg studs
    g.fillStyle(C.wallTrim);
    g.fillCircle(cx - w / 2 + 2, cy + h / 2 - 2, 2.5);
    g.fillCircle(cx + w / 2 - 2, cy + h / 2 - 2, 2.5);
  }

  // ── G. COFFEE BAR & COUNTER STATION (Premium controlling side) ───────────
  private drawPremiumBarCounter(g: Phaser.GameObjects.Graphics, tx: number, ty: number, tw: number, th: number) {
    const bx = this.px(tx), by = this.py(ty), bw = tw * TILE_SIZE, bh = th * TILE_SIZE;

    // Drop shadow
    g.fillStyle(C.shadow, 0.2);
    g.fillRect(bx + 4, by + 4, bw, bh);

    // Dark mahogany structure
    g.fillStyle(C.tableMahogany);
    g.fillRect(bx, by, bw, bh);

    // Polished white marble counter-top overlay
    g.fillStyle(C.tableMarble);
    g.fillRect(bx, by, bw, bh * 0.45);
    g.fillStyle(C.wallTrim);
    g.fillRect(bx, by + bh * 0.45, bw, 2); // Brass divider line

    // Wood panel grain textures
    g.lineStyle(1.5, C.shadow, 0.4);
    for (let x = bx + TILE_SIZE; x < bx + bw; x += TILE_SIZE) {
      g.beginPath(); g.moveTo(x, by + bh * 0.45); g.lineTo(x, by + bh); g.strokePath();
    }

    // High-end espresso machine on counter top
    g.fillStyle(0x34495e); // Slate machine body
    g.fillRect(bx + TILE_SIZE * 0.6, by + 6, TILE_SIZE * 0.9, TILE_SIZE * 0.5);
    g.fillStyle(C.wallTrim); // Brass shiny details
    g.fillRect(bx + TILE_SIZE * 0.8, by + 4, 4, 3);
    g.fillStyle(C.windowGlass, 0.8); // Steamer indicator
    g.fillCircle(bx + TILE_SIZE * 1.1, by + 8, 2.5);

    // Golden display shelf above counter (back wall)
    g.fillStyle(C.wallTrim, 0.7);
    g.fillRect(bx + 12, by - TILE_SIZE + 4, bw - 24, 3);
    
    // Cute coffee cups lined up on the shelf
    for (let cx = bx + TILE_SIZE * 0.8; cx < bx + bw - 12; cx += 20) {
      g.fillStyle(0xffffff, 0.95);
      g.fillRect(cx, by - TILE_SIZE + 8, 8, 6);
      g.fillStyle(C.wallTrim, 0.9);
      g.fillRect(cx - 2, by - TILE_SIZE + 10, 2, 3); // handle
    }

    // Three golden brass counter stools in front of counter
    const stoolPositions = [tx + 1, tx + 2.3, tx + 3.6];
    stoolPositions.forEach(st => {
      const sx = this.px(st), sy = by + bh + 4;
      g.fillStyle(C.shadow, 0.15);
      g.fillCircle(sx + 2, sy + 2, 8);
      g.fillStyle(C.wallTrim); // Brass frame leg base
      g.fillRect(sx - 1.5, sy, 3, TILE_SIZE * 0.6);
      g.fillStyle(C.chairBlue); // Royal Blue cushion seat top
      g.fillCircle(sx, sy, 8);
      g.lineStyle(1.5, C.wallTrim);
      g.strokeCircle(sx, sy, 8);
    });
  }

  // ── H. PREMIUM CIRCULAR MARBLE TABLE ─────────────────────────────────────
  private drawPremiumCircularTable(g: Phaser.GameObjects.Graphics, tx: number, ty: number, r: number) {
    const cx = this.px(tx), cy = this.py(ty), radius = r * TILE_SIZE;
    
    // Drop shadow
    g.fillStyle(C.shadow, 0.15);
    g.fillEllipse(cx + 4, cy + 4, radius, radius);

    // Golden pedestal base
    g.fillStyle(C.wallTrim);
    g.fillCircle(cx, cy, radius * 0.35);

    // Polished white marble table top
    g.fillStyle(C.tableMarble);
    g.fillCircle(cx, cy, radius);
    g.lineStyle(3, C.wallTrim, 0.9); // Gold/Brass rim
    g.strokeCircle(cx, cy, radius);

    // Elegant velvet chairs around table (finalview blue seats)
    const angleOffsets = [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2];
    const dist = radius + TILE_SIZE * 0.85;
    angleOffsets.forEach(angle => {
      const chx = cx + Math.cos(angle) * dist;
      const chy = cy + Math.sin(angle) * dist;
      this.drawLoungeArmchair(g, chx, chy, C.chairBlue);
    });
  }

  // ── I. EXQUISITE COZY GLOWING LAMP WITH SELECTION HALO ───────────────────
  private drawCozyGlowingLamp(g: Phaser.GameObjects.Graphics, tx: number, ty: number, glowScale = 3) {
    const lx = this.px(tx), ly = this.py(ty);
    const s = TILE_SIZE;
    
    // Translucent Warm Amber Light Halos (Premium atmosphere)
    g.fillStyle(C.lampGlow, 0.05);
    g.fillCircle(lx, ly, s * glowScale * 1.5);
    g.fillStyle(C.lampGlow, 0.09);
    g.fillCircle(lx, ly, s * glowScale * 0.9);
    g.fillStyle(C.lampGlow, 0.14);
    g.fillCircle(lx, ly, s * glowScale * 0.5);

    // Golden brass thin elegant stand
    g.fillStyle(C.wallTrim);
    g.fillRect(lx - 2, ly, 4, TILE_SIZE * 2);
    g.fillRect(lx - 6, ly + TILE_SIZE * 2, 12, 3); // base plate

    // Beautiful Art-deco lamp shade casting intense warm spot
    g.fillStyle(C.lampBrass);
    g.fillTriangle(lx - 12, ly, lx + 12, ly, lx, ly - 14);
    g.fillStyle(C.lampGlow);
    g.fillCircle(lx, ly - 2, 4); // glowing bulb center
  }

  // ── J. INDOOR BEAUTIFUL HOUSE PLANTS ─────────────────────────────────────
  private drawIndoorPlant(g: Phaser.GameObjects.Graphics, tx: number, ty: number, scale = 1) {
    const px = this.px(tx), py = this.py(ty);
    const s = scale * TILE_SIZE;

    // Terracotta design pot
    g.fillStyle(C.shadow, 0.12);
    g.fillRect(px - s * 0.35 + 2, py + s * 0.15, s * 0.7, s * 0.6);
    g.fillStyle(C.potTerra);
    g.fillRect(px - s * 0.35, py + s * 0.1, s * 0.7, s * 0.55);
    g.fillStyle(C.wallTrim, 0.85); // stylish brass band on pot
    g.fillRect(px - s * 0.35, py + s * 0.25, s * 0.7, 3);

    // Dynamic luxurious plant leaves structure
    g.fillStyle(C.leafLight);
    g.fillEllipse(px, py - s * 0.3, s * 1.1, s * 0.8);
    g.fillStyle(C.leafGreen);
    g.fillEllipse(px - s * 0.25, py - s * 0.1, s * 0.65, s * 0.55);
    g.fillEllipse(px + s * 0.25, py - s * 0.1, s * 0.65, s * 0.55);
    g.fillStyle(C.plantDark);
    g.fillEllipse(px, py - s * 0.45, s * 0.55, s * 0.6);
  }

  // ── K. LUXURIOUS MAIN TABLE CONFERENCE STATION ───────────────────────────
  private drawMainMeetingStation(g: Phaser.GameObjects.Graphics, tx: number, ty: number, tw: number, th: number) {
    const tableX = this.px(tx), tableY = this.py(ty), tableW = tw * TILE_SIZE, tableH = th * TILE_SIZE;
    
    // Soft base drop shadow
    g.fillStyle(C.shadow, 0.18);
    g.fillRect(tableX + 4, tableY + 4, tableW, tableH);

    // Polished golden pedestal supports
    g.fillStyle(C.wallTrim);
    g.fillRect(tableX + TILE_SIZE * 1.5, tableY + TILE_SIZE * 1.5, TILE_SIZE * 0.6, tableH - TILE_SIZE * 3);
    g.fillRect(tableX + tableW - TILE_SIZE * 2.1, tableY + TILE_SIZE * 1.5, TILE_SIZE * 0.6, tableH - TILE_SIZE * 3);

    // Premium white marble main top
    g.fillStyle(C.tableMarble);
    g.fillRect(tableX, tableY, tableW, tableH);
    g.lineStyle(2.5, C.wallTrim, 0.95); // Dazzling gold rim lining
    g.strokeRect(tableX, tableY, tableW, tableH);

    // Subtle luxury geometric design lines inside marble table center
    g.lineStyle(1.5, C.floorLine, 0.25);
    g.strokeRect(tableX + 16, tableY + 16, tableW - 32, tableH - 32);

    // High quality blue velvet chairs (finalview matching positions)
    const topPositions = [tx + 0.6, tx + 2.5, tx + 4.4, tx + 6.3];
    const bottomPositions = [tx + 0.6, tx + 2.5, tx + 4.4, tx + 6.3];

    topPositions.forEach(cx => this.drawLoungeArmchair(g, this.px(cx + 0.5), tableY - TILE_SIZE * 0.8, C.chairBlue));
    bottomPositions.forEach(cx => this.drawLoungeArmchair(g, this.px(cx + 0.5), tableY + tableH + TILE_SIZE * 0.8, C.chairBlue));
    
    // Left & Right table ends chairs
    this.drawLoungeArmchair(g, tableX - TILE_SIZE * 0.8, tableY + tableH * 0.3, C.chairBlue);
    this.drawLoungeArmchair(g, tableX - TILE_SIZE * 0.8, tableY + tableH * 0.7, C.chairBlue);
    this.drawLoungeArmchair(g, tableX + tableW + TILE_SIZE * 0.8, tableY + tableH * 0.3, C.chairBlue);
    this.drawLoungeArmchair(g, tableX + tableW + TILE_SIZE * 0.8, tableY + tableH * 0.7, C.chairBlue);
  }

  // ── L. COLLIDER BOUNDARIES CONFIGURATION ─────────────────────────────────
  private buildColliders() {
    this.addCollider(0, 0, ROOM_W, 2);
    this.addCollider(0, 0, 0.4, ROOM_H);
    this.addCollider(ROOM_W - 0.4, 0, 0.4, ROOM_H);
    this.addCollider(0, ROOM_H - 0.8, ROOM_W, 0.8);
    this.addCollider(1, 3, 3.5, 3.5); // Bookshelf
    this.addCollider(6.5, 6, 9, 7.2); // Main Marble table & chairs
    this.addCollider(14.5, 8.2, 4.2, 2.9); // Velvet Chesterfield Sofa
    this.addCollider(15, 11.2, 3.2, 1.7); // Gold Coffee table area
    this.addCollider(2.5, 8.5, 3.8, 3.2); // Left circular table area
    this.addCollider(17, 3, 4.6, 2.5); // Coffee Counter bar

    this.collisionBoxes.forEach(box => {
      const rect = this.scene.add.rectangle(box.x + box.w / 2, box.y + box.h / 2, box.w, box.h, 0x000000, 0);
      this.scene.physics.add.existing(rect, true);
      this.solids!.add(rect);
    });
  }

  setupColliders(player: Phaser.Physics.Arcade.Sprite) {
    if (player) {
      const body = player.body as Phaser.Physics.Arcade.Body;
      body.setSize(12, 8).setOffset(2, 56);
      body.setCollideWorldBounds(true);
      this.scene.physics.add.collider(player, this.solids!);
      player.setDepth(10000);
    }
  }

  getRandomSpawnPosition() {
    const zones = [
      { tileX: 8, tileY: 15 }, { tileX: 9, tileY: 15 },
      { tileX: 10, tileY: 15 }, { tileX: 12, tileY: 15 },
    ];
    return zones[Math.floor(Math.random() * zones.length)];
  }

  checkCollisionAt(pixelX: number, pixelY: number): boolean {
    for (const box of this.collisionBoxes) {
      if (pixelX >= box.x && pixelX <= box.x + box.w && pixelY >= box.y && pixelY <= box.y + box.h) return true;
    }
    return false;
  }

  getMapWidth() { return PX_W; }
  getMapHeight() { return PX_H; }
}

export const CAFE_ROOM_W = ROOM_W;
export const CAFE_ROOM_H = ROOM_H;
