// GÉNÉRÉ par tests/mine-positions.mjs (tactiques, validées par tests/solver.mjs) — ne pas éditer à la main.
// Format de position : "trait|Blancs|Noirs", cases FMJD 1..50, préfixe K = dame.
export const TACTICS = [
  {
    "pos": "w|K1,6,13,17,25,26,42,44|3,7,15,21,22,43",
    "best": "1x49",
    "category": "cascade",
    "gain": 5,
    "margin": 3,
    "baseline": 4
  },
  {
    "pos": "b|9,23,K26,27,35,40,42|16,24,30,K47",
    "best": "47x4",
    "category": "cascade",
    "gain": 3,
    "margin": 2,
    "baseline": -3
  },
  {
    "pos": "w|K2,K4,7,38,45,46|13,15,16,24,27,29,40,K47",
    "best": "2x49",
    "category": "cascade",
    "gain": 5,
    "margin": 3,
    "baseline": 0
  },
  {
    "pos": "b|K16,20,22,K29,31,K32,K43|K8,17,18,K39,K46",
    "best": "18x49",
    "category": "cascade",
    "gain": 1,
    "margin": 2,
    "baseline": -4
  },
  {
    "pos": "w|K4,K21,24,K26,29,K33,K48|K6,22,K27,34,38,K41,K45,K49",
    "best": "21x25",
    "category": "cascade",
    "gain": 5,
    "margin": 3,
    "baseline": -1
  },
  {
    "pos": "w|K3,6,7,37|20,26,27,39,45,K47,K48",
    "best": "3x16",
    "category": "cascade",
    "gain": 4,
    "margin": 3,
    "baseline": -5
  },
  {
    "pos": "b|9,10,17,23,31,32|8,11,24,25,K49,K50",
    "best": "49x15",
    "category": "cascade",
    "gain": 2,
    "margin": 2,
    "baseline": 4
  },
  {
    "pos": "w|29,31,34,35,36,37,39,40,41,42,43,44,45,46,47,48|1,2,4,5,6,7,9,10,12,13,14,15,16,17,20,26,28",
    "best": "29-24",
    "category": "sacrifice",
    "gain": 1,
    "margin": 1,
    "baseline": -1
  },
  {
    "pos": "b|26,28,30,35,36,40,42,43,44,45,46,47,48,49,50|1,2,3,4,5,7,8,9,10,11,13,15,16,18,19,20,21",
    "best": "1-6",
    "category": "sacrifice",
    "gain": 1,
    "margin": 1,
    "baseline": 2
  },
  {
    "pos": "b|K3,K38,K41,K46,K47|4,K10,19,K45",
    "best": "10-5",
    "category": "sacrifice",
    "gain": 5,
    "margin": 6,
    "baseline": -7
  },
  {
    "pos": "b|9,25,40|12,22,26,30,41,42",
    "best": "42-48",
    "category": "sacrifice",
    "gain": 5,
    "margin": 2,
    "baseline": 3
  },
  {
    "pos": "w|24,31,32,34,36,37,38,39,41,42,43,44,45,46,47,48,49,50|1,2,3,4,5,6,7,8,10,11,12,13,14,15,16,21,22,25",
    "best": "24-20",
    "category": "sacrifice",
    "gain": 3,
    "margin": 1,
    "baseline": 0
  },
  {
    "pos": "b|24,30,31,33,34,36,37,39,40,41,43,44,45,46,47,48,49,50|1,2,3,4,5,6,7,8,9,11,12,13,14,15,17,18,23,25",
    "best": "23-29",
    "category": "sacrifice",
    "gain": 1,
    "margin": 1,
    "baseline": 0
  },
  {
    "pos": "w|13,K25,30,42,47|2,10,K21,K33,43,K48",
    "best": "42-38",
    "category": "sacrifice",
    "gain": 1,
    "margin": 2,
    "baseline": -5
  },
  {
    "pos": "w|K4,K5,14,18,K23,K33,K45,50|7,K20,K29,K35,40,41,K42,K49",
    "best": "33x36",
    "category": "dame",
    "gain": 7,
    "margin": 5,
    "baseline": 0
  },
  {
    "pos": "w|K2,K6,11,K19,25,41|27,K28,K35,36",
    "best": "19x16",
    "category": "dame",
    "gain": 3,
    "margin": 2,
    "baseline": 4
  },
  {
    "pos": "w|K2,K3,6,14,25,K28,44,K49|7,15,32",
    "best": "2x38",
    "category": "dame",
    "gain": 984,
    "margin": 2,
    "baseline": 13
  },
  {
    "pos": "b|K8,K12,K16,K33,K45,K47,K48|K1,6,31,K37,41,K42,K46,K49",
    "best": "1x38",
    "category": "dame",
    "gain": 7,
    "margin": 1,
    "baseline": -3
  },
  {
    "pos": "w|K19,24,31,32,40,41,42,43,44,46,48,49,50|1,4,6,7,8,9,18",
    "best": "19x16",
    "category": "dame",
    "gain": 2,
    "margin": 3,
    "baseline": 8
  },
  {
    "pos": "b|K10,K13,K15,K31,K35,38|K4,K5,6,K22,K24,26,K39,K48",
    "best": "5x49",
    "category": "dame",
    "gain": 1,
    "margin": 1,
    "baseline": 4
  }
];
