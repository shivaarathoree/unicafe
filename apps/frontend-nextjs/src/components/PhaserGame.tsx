"use client";

import { useEffect, useRef } from "react";
import * as Phaser from "phaser";
import GameScene from "../scenes/GameScene";

interface PhaserGameProps {
  name: string;
  roomId: string;
  character: string;
  userId?: string | null;
}

const PhaserGame: React.FC<PhaserGameProps> = ({ name, roomId, character, userId }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (containerRef.current && !gameRef.current) {
      const w = window.innerWidth;
      const h = window.innerHeight;

      const config: Phaser.Types.Core.GameConfig = {
        type: Phaser.AUTO,
        width: w,
        height: h,
        parent: containerRef.current,
        scene: new GameScene(name, roomId, character, userId),
        backgroundColor: "#1a0e06",
        scale: {
          mode: Phaser.Scale.RESIZE,
          autoCenter: Phaser.Scale.CENTER_BOTH,
        },
        audio: {
          noAudio: true
        },
        physics: {
          default: "arcade",
          arcade: {
            debug: false,
            gravity: { x: 0, y: 0 },
          },
        },
        render: {
          pixelArt: true,
          antialias: false,
          roundPixels: true,
        },
      };

      gameRef.current = new Phaser.Game(config);
    }

    return () => {
      if (gameRef.current) {
        const scene = gameRef.current.scene.getScene("GameScene") as GameScene;
        scene?.cleanup();

        if (gameRef.current.sound) {
          gameRef.current.sound.pauseOnBlur = false;
          gameRef.current.sound.removeAll();
          gameRef.current.sound.stopAll();
        }

        try { gameRef.current.destroy(true); } catch {}
        gameRef.current = null;
      }
    };
  }, [name, roomId, character, userId]);

  return (
    <div
      ref={containerRef}
      style={{
        position: "fixed",
        inset: 0,
        width: "100dvw",
        height: "100dvh",
        imageRendering: "pixelated",
      }}
    />
  );
};

export default PhaserGame;
