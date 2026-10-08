// Intereses y rasgos de personalidad, con su etiqueta en ingles.
//
// REGLA CRITICA: el string en español (con su emoji) es el VALOR QUE SE GUARDA
// en users.interests y users.personality_traits, y ya hay 3.570 personas con
// esos valores en la base. Si se tradujera la lista, a toda esa gente se le
// despintarian los intereses que ya escogio, porque el valor guardado dejaria
// de coincidir con el de la lista.
//
// Por eso aqui el español es la LLAVE y el ingles es solo la etiqueta que se
// pinta. Nunca se guarda el texto en ingles.

import type { Idioma } from '@/lib/i18n';

export const AVAILABLE_INTERESTS = [
  '🎵 Música', '🎬 Cine', '📚 Lectura', '✈️ Viajar', '🍳 Cocinar',
  '🏃 Deportes', '🎨 Arte', '📸 Fotografía', '🎮 Videojuegos', '🧘 Yoga',
  '🏋️ Gym', '🎭 Teatro', '🍷 Vino', '☕ Café', '🌱 Naturaleza',
  '🐕 Mascotas', '🎤 Karaoke', '💃 Bailar', '🏖️ Playa', '⛰️ Montaña',
  '🍕 Comida', '🎪 Festivales', '🚴 Ciclismo', '🏊 Natación', '🎸 Música en vivo',
];

export const AVAILABLE_PERSONALITY = [
  '😊 Optimista', '🤗 Empático', '🎉 Divertido', '🧠 Intelectual', '💪 Aventurero',
  '🎯 Ambicioso', '😌 Tranquilo', '🤝 Sociable', '💭 Creativo', '📖 Curioso',
  '❤️ Romántico', '😂 Gracioso', '🎭 Espontáneo', '🧘 Zen', '🔥 Apasionado',
  '🤓 Geek', '🌟 Carismático', '💼 Profesional', '🎨 Artístico', '🏆 Competitivo',
];

// Español (valor guardado) -> ingles (solo etiqueta).
const EN: Record<string, string> = {
  '🎵 Música': '🎵 Music',
  '🎬 Cine': '🎬 Movies',
  '📚 Lectura': '📚 Reading',
  '✈️ Viajar': '✈️ Travel',
  '🍳 Cocinar': '🍳 Cooking',
  '🏃 Deportes': '🏃 Sports',
  '🎨 Arte': '🎨 Art',
  '📸 Fotografía': '📸 Photography',
  '🎮 Videojuegos': '🎮 Gaming',
  '🧘 Yoga': '🧘 Yoga',
  '🏋️ Gym': '🏋️ Gym',
  '🎭 Teatro': '🎭 Theatre',
  '🍷 Vino': '🍷 Wine',
  '☕ Café': '☕ Coffee',
  '🌱 Naturaleza': '🌱 Nature',
  '🐕 Mascotas': '🐕 Pets',
  '🎤 Karaoke': '🎤 Karaoke',
  '💃 Bailar': '💃 Dancing',
  '🏖️ Playa': '🏖️ Beach',
  '⛰️ Montaña': '⛰️ Mountains',
  '🍕 Comida': '🍕 Food',
  '🎪 Festivales': '🎪 Festivals',
  '🚴 Ciclismo': '🚴 Cycling',
  '🏊 Natación': '🏊 Swimming',
  '🎸 Música en vivo': '🎸 Live music',
  '😊 Optimista': '😊 Optimistic',
  '🤗 Empático': '🤗 Empathetic',
  '🎉 Divertido': '🎉 Fun',
  '🧠 Intelectual': '🧠 Intellectual',
  '💪 Aventurero': '💪 Adventurous',
  '🎯 Ambicioso': '🎯 Ambitious',
  '😌 Tranquilo': '😌 Easy-going',
  '🤝 Sociable': '🤝 Sociable',
  '💭 Creativo': '💭 Creative',
  '📖 Curioso': '📖 Curious',
  '❤️ Romántico': '❤️ Romantic',
  '😂 Gracioso': '😂 Funny',
  '🎭 Espontáneo': '🎭 Spontaneous',
  '🧘 Zen': '🧘 Zen',
  '🔥 Apasionado': '🔥 Passionate',
  '🤓 Geek': '🤓 Geek',
  '🌟 Carismático': '🌟 Charismatic',
  '💼 Profesional': '💼 Professional',
  '🎨 Artístico': '🎨 Artistic',
  '🏆 Competitivo': '🏆 Competitive',
};

// Devuelve como se PINTA un interes o rasgo. Si llega uno viejo que ya no esta
// en la lista, se muestra tal cual en vez de desaparecer.
export function etiquetaGusto(valor: string, idioma: Idioma): string {
  if (idioma !== 'en') return valor;
  return EN[valor] ?? valor;
}
