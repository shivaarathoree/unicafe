import * as Phaser from "phaser";
import { TILE_SIZE } from "./types";

export class MapManager {
  private scene: Phaser.Scene;
  private map: Phaser.Tilemaps.Tilemap | null = null;
  private solidsGroup: Phaser.Physics.Arcade.StaticGroup | null = null;
  private collisionBoxes: { x: number; y: number; w: number; h: number }[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  preload() {
    this.scene.load.image("Room_Builder_Office_32x32", "/tilesets/textures/Room_Builder_Office_32x32.png");
    this.scene.load.image("Modern_Office_Black_Shadow_32x32", "/tilesets/textures/Modern_Office_Black_Shadow_32x32.png");
    this.scene.load.tilemapTiledJSON("office-map", "/tilesets/office-map.tmj");
  }

  create() {
    this.map = this.scene.make.tilemap({ key: "office-map" });
    
    // The names here must match the names of the tilesets in Tiled (.tmj file)
    const tileset1 = this.map.addTilesetImage("Room_Builder_Office_32x32", "Room_Builder_Office_32x32");
    const tileset2 = this.map.addTilesetImage("Modern_Office_Black_Shadow_32x32", "Modern_Office_Black_Shadow_32x32");
    
    const tilesets = [];
    if (tileset1) tilesets.push(tileset1);
    if (tileset2) tilesets.push(tileset2);

    const groundLayer = this.map.createLayer("Ground", tilesets, 0, 0);
    if (groundLayer) groundLayer.setDepth(0);
    
    const wallsLayer = this.map.createLayer("Walls", tilesets, 0, 0);
    if (wallsLayer) wallsLayer.setDepth(1);
    
    const desksBackLayer = this.map.createLayer("DesksBack", tilesets, 0, 0);
    if (desksBackLayer) desksBackLayer.setDepth(2);
    
    const deskItemsBackLayer = this.map.createLayer("DeskItems_Back", tilesets, 0, 0);
    if (deskItemsBackLayer) deskItemsBackLayer.setDepth(3);
    
    const dividersLayer = this.map.createLayer("Dividers", tilesets, 0, 0);
    if (dividersLayer) dividersLayer.setDepth(4);
    
    const desksFrontLayer = this.map.createLayer("DesksFront", tilesets, 0, 0);
    if (desksFrontLayer) desksFrontLayer.setDepth(5);
    
    const deskItemsFrontLayer = this.map.createLayer("DeskItems_Front", tilesets, 0, 0);
    if (deskItemsFrontLayer) deskItemsFrontLayer.setDepth(6);
    
    const overPlayerLayer = this.map.createLayer("OverPlayer_Layer", tilesets, 0, 0);
    if (overPlayerLayer) overPlayerLayer.setDepth(20000);

    this.solidsGroup = this.scene.physics.add.staticGroup();
    this.buildColliders();
  }

  private buildColliders() {
    if (!this.map) return;
    
    const objectLayer = this.map.getObjectLayer("Colliders");
    if (objectLayer && objectLayer.objects) {
      objectLayer.objects.forEach(obj => {
        if (obj.x === undefined || obj.y === undefined || obj.width === undefined || obj.height === undefined) return;
        
        // Phaser uses center coordinates for physics rectangles by default when using physics.add.existing
        const x = obj.x + obj.width / 2;
        const y = obj.y + obj.height / 2;
        const rect = this.scene.add.rectangle(x, y, obj.width, obj.height, 0x000000, 0);
        this.scene.physics.add.existing(rect, true);
        this.solidsGroup!.add(rect);
        
        this.collisionBoxes.push({
          x: obj.x,
          y: obj.y,
          w: obj.width,
          h: obj.height
        });
      });
    }
  }

  setupColliders(player: Phaser.Physics.Arcade.Sprite) {
    if (player && this.solidsGroup) {
      const body = player.body as Phaser.Physics.Arcade.Body;
      body.setSize(16, 12).setOffset(8, 20);
      body.setCollideWorldBounds(true);
      this.scene.physics.add.collider(player, this.solidsGroup);
      player.setDepth(10000);
    }
  }

  getRandomSpawnPosition() {
    // Return a central spawn position
    return { tileX: 15, tileY: 10 };
  }

  checkCollisionAt(pixelX: number, pixelY: number): boolean {
    for (const box of this.collisionBoxes) {
      if (
        pixelX >= box.x && 
        pixelX <= box.x + box.w && 
        pixelY >= box.y && 
        pixelY <= box.y + box.h
      ) {
        return true;
      }
    }
    return false;
  }

  getMapWidth() {
    return this.map ? this.map.widthInPixels : 55 * TILE_SIZE;
  }
  
  getMapHeight() {
    return this.map ? this.map.heightInPixels : 25 * TILE_SIZE;
  }
}

export const CAFE_ROOM_W = 55;
export const CAFE_ROOM_H = 25;
