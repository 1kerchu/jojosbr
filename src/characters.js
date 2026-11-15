// Datos de personajes. `model` es opcional: si existe public/models/<model> se usa,
// si no, se construye un jinete low-poly con los colores de `look`.
export const CHARACTERS = [
  {
    id: 'johnny', name: 'Johnny Joestar', stand: 'Tusk ACT 4', horse: 'Slow Dancer',
    color: '#4fb3ff', horseColor: 0xc98a4b,
    stats: { speed: 1.0, accel: 1.0, stamina: 1.0, handling: 1.05 },
    ability: { id: 'nails', name: 'Nail Shot', desc: 'Dispara 3 uñas giratorias hacia delante. Ralentizan al que toquen.', cooldown: 9 },
    look: { skin: 0xf2c9a0, shirt: 0x2a3d7c, pants: 0x3b3b55, hat: 'beanie', hatColor: 0x1b1f3a, accent: 0xffd23f, hair: 0xe8d38a },
    model: 'johnny.glb'
  },
  {
    id: 'gyro', name: 'Gyro Zeppeli', stand: 'Ball Breaker', horse: 'Valkyrie',
    color: '#7dff6a', horseColor: 0x5a3a22,
    stats: { speed: 1.0, accel: 1.05, stamina: 1.0, handling: 1.0 },
    ability: { id: 'steelball', name: 'Steel Ball (Spin)', desc: 'Lanza una bola de acero teledirigida al rival más cercano por delante. Lo deja girando.', cooldown: 10 },
    look: { skin: 0xe9b98e, shirt: 0x2f6b3a, pants: 0x3a2a1a, hat: 'wide', hatColor: 0x2b6e48, accent: 0xffe14d, hair: 0xf3dd6b },
    model: 'gyro.glb'
  },
  {
    id: 'diego', name: 'Diego Brando', stand: 'Scary Monsters', horse: 'Silver Bullet',
    color: '#ffb02e', horseColor: 0x9aa3ad,
    stats: { speed: 1.04, accel: 1.0, stamina: 0.95, handling: 0.97 },
    ability: { id: 'dino', name: 'Scary Monsters', desc: 'Se transforma en dinosaurio 5 s: +35% velocidad y embiste a quien toque.', cooldown: 13 },
    look: { skin: 0xf0c49a, shirt: 0xd88a1c, pants: 0x2b2b2b, hat: 'helmet', hatColor: 0xf2a81d, accent: 0x7a2fc9, hair: 0xf7e27a },
    model: 'diego.glb'
  },
  {
    id: 'valentine', name: 'Funny Valentine', stand: 'D4C', horse: 'Caballo presidencial',
    color: '#ff5fd2', horseColor: 0xf1ece2,
    stats: { speed: 0.98, accel: 0.98, stamina: 1.05, handling: 1.0 },
    ability: { id: 'd4c', name: 'D4C - Love Train', desc: 'Salta a otra dimensión: teletransporte hacia delante y escudo de 3 s que anula ataques.', cooldown: 14 },
    look: { skin: 0xf4d0b0, shirt: 0xe2508f, pants: 0x3b5bdb, hat: 'curls', hatColor: 0xf7e9a0, accent: 0xffffff, hair: 0xf7e9a0 },
    model: 'valentine.glb'
  },
  {
    id: 'hotpants', name: 'Hot Pants', stand: 'Cream Starter', horse: 'Caballo pinto',
    color: '#ff8fb1', horseColor: 0xe9d6c1,
    stats: { speed: 0.99, accel: 1.06, stamina: 1.0, handling: 1.04 },
    ability: { id: 'cream', name: 'Cream Starter', desc: 'Rocía carne en spray hacia atrás: ciega y frena a los que te persiguen.', cooldown: 10 },
    look: { skin: 0xf2c4a2, shirt: 0xf26fa0, pants: 0xf2f2f2, hat: 'hood', hatColor: 0xf58ab0, accent: 0xffffff, hair: 0xd9d9d9 },
    model: 'hotpants.glb'
  },
  {
    id: 'sandman', name: 'Sandman', stand: 'In a Silent Way', horse: '(¡corre a pie!)',
    color: '#e8c27a', horseColor: null,
    stats: { speed: 0.97, accel: 1.1, stamina: 1.25, handling: 1.1 },
    ability: { id: 'sound', name: 'In a Silent Way', desc: 'Lanza una onda de sonido "BOOM" por el suelo que tumba a todos los rivales cercanos por delante.', cooldown: 11 },
    look: { skin: 0xa8714a, shirt: 0xc9a46a, pants: 0x6b4a2a, hat: 'feather', hatColor: 0x111111, accent: 0xd94b2b, hair: 0x111111 },
    model: 'sandman.glb'
  },
  {
    id: 'pocoloco', name: 'Pocoloco', stand: 'Hey Ya!', horse: 'Caballo de la suerte',
    color: '#ffe23d', horseColor: 0x3a2a1e,
    stats: { speed: 1.0, accel: 1.0, stamina: 1.0, handling: 1.0 },
    ability: { id: 'luck', name: 'Hey Ya!', desc: '¡Hoy es tu día de suerte! Efecto aleatorio: turbo enorme, escudo, recarga de estamina o atraer una parte del Cadáver.', cooldown: 9 },
    look: { skin: 0x7a4a2b, shirt: 0xf2d23a, pants: 0x2d5fa8, hat: 'cap', hatColor: 0xf24b3a, accent: 0x2dd36f, hair: 0x111111 },
    model: 'pocoloco.glb'
  }
];

export const charById = (id) => CHARACTERS.find(c => c.id === id) || CHARACTERS[0];

export const BOT_NAMES = ['Mountain Tim', 'Wekapipo', 'Norisuke', 'Blackmore', 'Ringo Roadagain', 'Magenta', 'Axl RO', 'Oyecomova'];
