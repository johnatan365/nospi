// Lista unica de ciudades de Nospi.
//
// POR QUE SOLO LAS CAPITALES Y NO LOS 1.122 MUNICIPIOS:
// el municipio no da precision, parte la audiencia. Si "Envigado" existiera
// como ciudad aparte, quien la marcara NO veria la cena de Medellin, y habria
// que marcar diez municipios cada vez que se crea un evento. La unidad
// correcta para Nospi es el area a la que la gente se desplaza para una cena.
//
// Los municipios viven en `alias`: NO aparecen en la lista, pero el buscador
// los reconoce y lleva a su ciudad ("Envigado" -> Medellin, "Ipiales" ->
// Pasto). Sin eso la lista corta no funciona: quien escribe su municipio y no
// encuentra nada, abandona el registro.
//
// Los alias tambien incluyen la version sin tilde de cada capital, para que
// quien escriba "medellin" o "bogota" igual la encuentre.
//
// Al abrir una ciudad nueva, se agrega aqui y queda disponible de una en el
// admin, en el registro y en el filtro de la pestana de Eventos.

export interface CiudadNospi {
  nombre: string;
  departamento: string;
  alias: string[];
}

export const CIUDADES_COLOMBIA: CiudadNospi[] = [
  { nombre: 'Bogotá', departamento: 'Cundinamarca', alias: ['Soacha', 'Chía', 'Zipaquirá', 'Facatativá', 'Madrid', 'Mosquera', 'Funza', 'Cajicá', 'Cota', 'La Calera', 'Tocancipá', 'Fusagasugá', 'Sibaté', 'Ubaté', 'Bogota'] },
  { nombre: 'Medellín', departamento: 'Antioquia', alias: ['Envigado', 'Itagüí', 'Bello', 'Sabaneta', 'La Estrella', 'Caldas', 'Copacabana', 'Girardota', 'Barbosa', 'Rionegro', 'Marinilla', 'La Ceja', 'Guarne', 'Apartadó', 'Turbo', 'Caucasia', 'Medellin'] },
  { nombre: 'Cali', departamento: 'Valle del Cauca', alias: ['Palmira', 'Jamundí', 'Yumbo', 'Candelaria', 'Buga', 'Tuluá', 'Buenaventura', 'Florida', 'Pradera'] },
  { nombre: 'Barranquilla', departamento: 'Atlántico', alias: ['Soledad', 'Malambo', 'Puerto Colombia', 'Galapa', 'Sabanalarga', 'Baranoa', 'Sabanagrande'] },
  { nombre: 'Cartagena', departamento: 'Bolívar', alias: ['Turbaco', 'Arjona', 'Turbaná', 'Santa Rosa', 'Magangué', 'El Carmen de Bolívar'] },
  { nombre: 'Bucaramanga', departamento: 'Santander', alias: ['Floridablanca', 'Girón', 'Piedecuesta', 'Barrancabermeja', 'San Gil', 'Socorro', 'Lebrija'] },
  { nombre: 'Cúcuta', departamento: 'Norte de Santander', alias: ['Villa del Rosario', 'Los Patios', 'El Zulia', 'Ocaña', 'Pamplona', 'Cucuta'] },
  { nombre: 'Pereira', departamento: 'Risaralda', alias: ['Dosquebradas', 'Santa Rosa de Cabal', 'La Virginia', 'Cartago', 'Marsella'] },
  { nombre: 'Santa Marta', departamento: 'Magdalena', alias: ['Ciénaga', 'Fundación', 'El Rodadero', 'Gaira', 'Aracataca'] },
  { nombre: 'Ibagué', departamento: 'Tolima', alias: ['Espinal', 'Melgar', 'Girardot', 'Honda', 'Líbano', 'Chaparral', 'Flandes', 'Ibague'] },
  { nombre: 'Manizales', departamento: 'Caldas', alias: ['Villamaría', 'Chinchiná', 'La Dorada', 'Riosucio', 'Anserma', 'Neira'] },
  { nombre: 'Villavicencio', departamento: 'Meta', alias: ['Acacías', 'Granada', 'Restrepo', 'Puerto López', 'Cumaral'] },
  { nombre: 'Pasto', departamento: 'Nariño', alias: ['Ipiales', 'Tumaco', 'Túquerres', 'La Unión', 'Sandoná', 'Samaniego'] },
  { nombre: 'Neiva', departamento: 'Huila', alias: ['Pitalito', 'Garzón', 'La Plata', 'Campoalegre', 'Rivera'] },
  { nombre: 'Armenia', departamento: 'Quindío', alias: ['Calarcá', 'Montenegro', 'Circasia', 'Quimbaya', 'Salento', 'La Tebaida'] },
  { nombre: 'Valledupar', departamento: 'Cesar', alias: ['Aguachica', 'Bosconia', 'Codazzi', 'La Paz', 'San Diego'] },
  { nombre: 'Montería', departamento: 'Córdoba', alias: ['Cereté', 'Sahagún', 'Lorica', 'Planeta Rica', 'Montelíbano', 'Tierralta', 'Monteria'] },
  { nombre: 'Sincelejo', departamento: 'Sucre', alias: ['Corozal', 'Sampués', 'Tolú', 'San Marcos', 'Sincé'] },
  { nombre: 'Popayán', departamento: 'Cauca', alias: ['Santander de Quilichao', 'Puerto Tejada', 'Piendamó', 'Silvia', 'Timbío', 'Popayan'] },
  { nombre: 'Tunja', departamento: 'Boyacá', alias: ['Duitama', 'Sogamoso', 'Paipa', 'Chiquinquirá', 'Villa de Leyva', 'Nobsa'] },
  { nombre: 'Riohacha', departamento: 'La Guajira', alias: ['Maicao', 'Uribia', 'Manaure', 'Fonseca', 'San Juan del Cesar', 'Dibulla'] },
  { nombre: 'Florencia', departamento: 'Caquetá', alias: ['San Vicente del Caguán', 'Belén de los Andaquíes', 'Morelia'] },
  { nombre: 'Quibdó', departamento: 'Chocó', alias: ['Istmina', 'Condoto', 'Tadó', 'Quibdo'] },
  { nombre: 'Yopal', departamento: 'Casanare', alias: ['Aguazul', 'Villanueva', 'Tauramena', 'Paz de Ariporo', 'Monterrey'] },
  { nombre: 'Mocoa', departamento: 'Putumayo', alias: ['Puerto Asís', 'Sibundoy', 'Orito', 'Villagarzón'] },
  { nombre: 'Arauca', departamento: 'Arauca', alias: ['Saravena', 'Arauquita', 'Tame', 'Fortul'] },
  { nombre: 'Leticia', departamento: 'Amazonas', alias: ['Puerto Nariño'] },
  { nombre: 'San José del Guaviare', departamento: 'Guaviare', alias: ['El Retorno', 'Calamar', 'Miraflores'] },
  { nombre: 'San Andrés', departamento: 'Archipiélago de San Andrés', alias: ['Providencia', 'Santa Catalina', 'San Andres'] },
  { nombre: 'Mitú', departamento: 'Vaupés', alias: ['Carurú', 'Taraira', 'Mitu'] },
  { nombre: 'Puerto Carreño', departamento: 'Vichada', alias: ['La Primavera', 'Cumaribo', 'Santa Rosalía'] },
  { nombre: 'Inírida', departamento: 'Guainía', alias: ['Barrancominas', 'Inirida'] },
];

// Nombres a secas, para los <select> y los Picker.
export const NOMBRES_CIUDADES_COLOMBIA: string[] = CIUDADES_COLOMBIA.map((c) => c.nombre);

// Otros paises: todavia no hay operacion alla, se dejan las principales para
// no romper el paso de pais del onboarding.
export const CIUDADES_POR_PAIS: { [pais: string]: string[] } = {
  'Colombia': NOMBRES_CIUDADES_COLOMBIA,
  'Argentina': ['Buenos Aires', 'Cordoba', 'Rosario', 'Mendoza', 'La Plata'],
  'Brasil': ['Sao Paulo', 'Rio de Janeiro', 'Brasilia', 'Salvador', 'Fortaleza'],
  'Chile': ['Santiago', 'Valparaiso', 'Concepcion', 'La Serena', 'Antofagasta'],
  'Ecuador': ['Quito', 'Guayaquil', 'Cuenca', 'Santo Domingo', 'Machala'],
  'España': ['Madrid', 'Barcelona', 'Valencia', 'Sevilla', 'Zaragoza'],
  'Estados Unidos': ['Nueva York', 'Los Angeles', 'Chicago', 'Houston', 'Miami'],
  'México': ['Ciudad de Mexico', 'Guadalajara', 'Monterrey', 'Puebla', 'Tijuana'],
  'Perú': ['Lima', 'Arequipa', 'Trujillo', 'Chiclayo', 'Cusco'],
  'Venezuela': ['Caracas', 'Maracaibo', 'Valencia', 'Barquisimeto', 'Maracay'],
};

export const PAISES_NOSPI: string[] = Object.keys(CIUDADES_POR_PAIS);

// Minusculas y sin tildes, para que "Medellin", "medellín" y "MEDELLIN"
// sean lo mismo al comparar y al buscar.
export function normalizarTexto(texto: string | null | undefined): string {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

// Devuelve el nombre oficial de una ciudad a partir de cualquier forma de
// escribirla (sin tilde, un municipio vecino, etc). null si no calza con nada.
export function canonizarCiudad(texto: string | null | undefined): string | null {
  const q = normalizarTexto(texto);
  if (!q) return null;
  for (const c of CIUDADES_COLOMBIA) {
    if (normalizarTexto(c.nombre) === q) return c.nombre;
  }
  for (const c of CIUDADES_COLOMBIA) {
    if (c.alias.some((a) => normalizarTexto(a) === q)) return c.nombre;
  }
  return null;
}

// Dos nombres de ciudad son la misma sin importar tildes ni mayusculas.
export function mismaCiudad(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizarTexto(a);
  const nb = normalizarTexto(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const ca = canonizarCiudad(a);
  const cb = canonizarCiudad(b);
  return !!ca && !!cb && ca === cb;
}

export interface ResultadoCiudad {
  ciudad: CiudadNospi;
  // Municipio por el que se encontro, cuando no se busco por el nombre de la
  // ciudad. Sirve para mostrar "Incluye Envigado" debajo de Medellin.
  via: string;
}

// Busca por nombre de ciudad, por departamento o por municipio (alias).
export function buscarCiudades(texto: string | null | undefined): ResultadoCiudad[] {
  const q = normalizarTexto(texto);
  const salida: ResultadoCiudad[] = [];
  for (const ciudad of CIUDADES_COLOMBIA) {
    if (!q) { salida.push({ ciudad, via: '' }); continue; }
    if (normalizarTexto(ciudad.nombre).includes(q)) { salida.push({ ciudad, via: '' }); continue; }
    if (normalizarTexto(ciudad.departamento).includes(q)) { salida.push({ ciudad, via: '' }); continue; }
    const alias = ciudad.alias.find((a) => normalizarTexto(a).includes(q));
    // Los alias sin tilde de la propia capital no se muestran como "Incluye".
    if (alias) {
      const esLaMisma = normalizarTexto(alias) === normalizarTexto(ciudad.nombre);
      salida.push({ ciudad, via: esLaMisma ? '' : alias });
    }
  }
  return salida;
}

// Las ciudades en las que se ve un evento. Un evento nacional se ve en todas.
export function eventoSeVeEn(
  evento: { cities?: string[] | null; city?: string | null; nacional?: boolean | null },
  ciudadUsuario: string | null | undefined,
): boolean {
  if (evento?.nacional) return true;
  if (!ciudadUsuario) return false;
  const lista = (evento?.cities && evento.cities.length > 0)
    ? evento.cities
    : (evento?.city ? [evento.city] : []);
  return lista.some((c) => mismaCiudad(c, ciudadUsuario));
}

// Texto para mostrar donde se ve un evento.
export function textoCiudadesEvento(
  evento: { cities?: string[] | null; city?: string | null; nacional?: boolean | null },
): string {
  if (evento?.nacional) return 'Todo el pais';
  const lista = (evento?.cities && evento.cities.length > 0)
    ? evento.cities
    : (evento?.city ? [evento.city] : []);
  if (lista.length === 0) return 'Sin ciudad';
  if (lista.length === 1) return lista[0];
  if (lista.length === 2) return lista[0] + ' y ' + lista[1];
  return lista.slice(0, -1).join(', ') + ' y ' + lista[lista.length - 1];
}
