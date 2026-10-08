// 全角色與背景使用半寫實生成美術，來源與錨點見 assets metadata。
const character = (id, heightRatio, metadata) => Object.freeze({
  ...metadata, id, heightRatio,
  canvas: Object.freeze(metadata.canvas), visibleBounds: Object.freeze(metadata.visibleBounds), anchor: Object.freeze(metadata.anchor),
  poseMetadata: Object.freeze(Object.fromEntries(Object.entries(metadata.poses).map(([pose, art]) => [pose, Object.freeze({ anchor: Object.freeze(art.anchor) })]))),
  poses: Object.freeze(Object.fromEntries(['idle','attack','defend','hurt'].map(pose => [pose,
    new URL(`../assets/characters/${id}/${pose === 'attack' ? 'attack' : 'idle'}.webp?v=0.9.6`, import.meta.url).href]))),
});
export const HERO_VISUAL = Object.freeze({
  id: 'silver-knight', prototype: false, heightRatio: 1, facing: 'right',
  canvas: Object.freeze({ width: 1024, height: 1536 }),
  anchor: Object.freeze({ x: 0.5, y: 1464 / 1536 }),
  visibleBounds: Object.freeze({ x: 0, y: 50, width: 1024, height: 1423 }),
  safeMargin: 0.015,
  poseMetadata: Object.freeze(Object.fromEntries(Object.entries({ idle: 1464, attack: 1461, defend: 1473, hurt: 1432 })
    .map(([pose, foot]) => [pose, Object.freeze({ anchor: Object.freeze({ x: 0.5, y: foot / 1536 }) })]))),
  poses: Object.freeze(Object.fromEntries(['idle', 'attack', 'defend', 'hurt'].map(pose =>
    [pose, new URL(`../assets/characters/silver-knight/${pose}.webp?v=0.9.6`, import.meta.url).href]))),
});
export const BOSS_VISUALS = Object.freeze([
  character('iron-guard', 1.5, {
    "prototype": false,
    "facing": "left",
    "mirror": false,
    "canvas": {
      "width": 1024,
      "height": 1536
    },
    "visibleBounds": {
      "x": 0,
      "y": 12,
      "width": 1024,
      "height": 1501
    },
    "anchor": {
      "x": 0.5,
      "y": 0.9596354166666666
    },
    "safeMargin": 0.01,
    "theme": "iron",
    "weapon": "axe",
    "floating": 0,
    "poses": {
      "idle": {
        "anchor": {
          "x": 0.5,
          "y": 0.9596354166666666
        }
      },
      "attack": {
        "anchor": {
          "x": 0.5,
          "y": 0.9850260416666666
        }
      }
    }
  }),
  character('shadow-assassin', 0.95, {
    "prototype": false,
    "facing": "left",
    "mirror": false,
    "canvas": {
      "width": 1024,
      "height": 1536
    },
    "visibleBounds": {
      "x": 0,
      "y": 72,
      "width": 1024,
      "height": 1398
    },
    "anchor": {
      "x": 0.5,
      "y": 0.95703125
    },
    "safeMargin": 0.01,
    "theme": "shadow",
    "weapon": "daggers",
    "floating": 0,
    "poses": {
      "idle": {
        "anchor": {
          "x": 0.5,
          "y": 0.95703125
        }
      },
      "attack": {
        "anchor": {
          "x": 0.5,
          "y": 0.9524739583333334
        }
      }
    }
  }),
  character('flame-general', 1.25, {
    "prototype": false,
    "facing": "left",
    "mirror": false,
    "canvas": {
      "width": 1024,
      "height": 1536
    },
    "visibleBounds": {
      "x": 0,
      "y": 12,
      "width": 1024,
      "height": 1498
    },
    "anchor": {
      "x": 0.5,
      "y": 0.9830729166666666
    },
    "safeMargin": 0.01,
    "theme": "flame",
    "weapon": "greatsword",
    "floating": 0,
    "poses": {
      "idle": {
        "anchor": {
          "x": 0.5,
          "y": 0.9830729166666666
        }
      },
      "attack": {
        "anchor": {
          "x": 0.5,
          "y": 0.9596354166666666
        }
      }
    }
  }),
  character('void-lord', 1.35, {
    "prototype": false,
    "facing": "left",
    "mirror": true,
    "canvas": {
      "width": 1024,
      "height": 1536
    },
    "visibleBounds": {
      "x": 0,
      "y": 19,
      "width": 1024,
      "height": 1490
    },
    "anchor": {
      "x": 0.5,
      "y": 0.982421875
    },
    "safeMargin": 0.01,
    "theme": "void",
    "weapon": "staff",
    "floating": 0.08,
    "poses": {
      "idle": {
        "anchor": {
          "x": 0.5,
          "y": 0.982421875
        }
      },
      "attack": {
        "anchor": {
          "x": 0.5,
          "y": 0.9733072916666666
        }
      }
    }
  }),
  character('final-overlord', 1.7, {
    "prototype": false,
    "facing": "left",
    "mirror": true,
    "canvas": {
      "width": 1024,
      "height": 1536
    },
    "visibleBounds": {
      "x": 0,
      "y": 12,
      "width": 1024,
      "height": 1492
    },
    "anchor": {
      "x": 0.5,
      "y": 0.9791666666666666
    },
    "safeMargin": 0.01,
    "theme": "final",
    "weapon": "greatsword",
    "floating": 0,
    "poses": {
      "idle": {
        "anchor": {
          "x": 0.5,
          "y": 0.9791666666666666
        }
      },
      "attack": {
        "anchor": {
          "x": 0.5,
          "y": 0.9759114583333334
        }
      }
    }
  })
]);
export const BERSERK_VISUAL = character('final-overlord-berserk', 1.7, {
    "prototype": false,
    "facing": "left",
    "mirror": true,
    "canvas": {
      "width": 1024,
      "height": 1536
    },
    "visibleBounds": {
      "x": 0,
      "y": 11,
      "width": 1024,
      "height": 1507
    },
    "anchor": {
      "x": 0.5,
      "y": 0.9830729166666666
    },
    "safeMargin": 0.01,
    "theme": "berserk",
    "weapon": "greatsword",
    "floating": 0,
    "poses": {
      "idle": {
        "anchor": {
          "x": 0.5,
          "y": 0.9830729166666666
        }
      },
      "attack": {
        "anchor": {
          "x": 0.5,
          "y": 0.98828125
        }
      }
    }
  });
export const ARENA_VISUALS = Object.freeze([
  ['ruined-arena', '破敗競技場'], ['moonlit-ruins', '月夜廢墟'], ['lava-fortress', '熔岩堡壘'],
  ['void-temple', '虛空神殿'], ['terminal-throne', '終末王座'],
].map(([id, name]) => Object.freeze({ id, name, prototype: false,
  src: new URL(`../assets/backgrounds/${id}.webp?v=0.9.6`, import.meta.url).href })));
