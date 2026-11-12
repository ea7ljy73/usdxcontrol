import { getLocale } from './i18n'

// Nombres en inglés de las entidades DXCC de la tabla (que está en español). Los que no
// cambian (Chile, Malta…) no hace falta ponerlos.
const EN: Record<string, string> = {
  'Afganistán': 'Afghanistan', 'Alemania': 'Germany', 'Arabia Saudí': 'Saudi Arabia', 'Argelia': 'Algeria',
  'Azerbaiyán': 'Azerbaijan', 'Bangladés': 'Bangladesh', 'Bélgica': 'Belgium', 'Belice': 'Belize', 'Benín': 'Benin',
  'Bermudas': 'Bermuda', 'Bielorrusia': 'Belarus', 'Bosnia': 'Bosnia', 'Botsuana': 'Botswana', 'Brasil': 'Brazil',
  'Bután': 'Bhutan', 'Cabo Verde': 'Cape Verde', 'Camboya': 'Cambodia', 'Camerún': 'Cameroon', 'Canadá': 'Canada',
  'Canarias': 'Canary Islands', 'Catar': 'Qatar', 'Ceuta y Melilla': 'Ceuta & Melilla', 'Chipre': 'Cyprus',
  'Comoras': 'Comoros', 'Corea del Sur': 'South Korea', 'Costa de Marfil': 'Ivory Coast', 'Creta': 'Crete',
  'Croacia': 'Croatia', 'Dinamarca': 'Denmark', 'Egipto': 'Egypt', 'Emiratos Árabes': 'United Arab Emirates',
  'Eslovaquia': 'Slovakia', 'Eslovenia': 'Slovenia', 'España': 'Spain', 'Estados Unidos': 'United States',
  'Esuatini': 'Eswatini', 'Etiopía': 'Ethiopia', 'Filipinas': 'Philippines', 'Finlandia': 'Finland', 'Fiyi': 'Fiji',
  'Francia': 'France', 'Gabón': 'Gabon', 'Grecia': 'Greece', 'Groenlandia': 'Greenland', 'Guayana Francesa': 'French Guiana',
  'Guinea-Bisáu': 'Guinea-Bissau', 'Guinea Ecuatorial': 'Equatorial Guinea', 'Haití': 'Haiti', 'Hawái': 'Hawaii',
  'Hungría': 'Hungary', 'Irak': 'Iraq', 'Irán': 'Iran', 'Irlanda': 'Ireland', 'Islandia': 'Iceland',
  'Islas Baleares': 'Balearic Islands', 'Islas Feroe': 'Faroe Islands', 'Islas Marshall': 'Marshall Islands',
  'Islas Salomón': 'Solomon Islands', 'Italia': 'Italy', 'Japón': 'Japan', 'Jordania': 'Jordan', 'Kazajistán': 'Kazakhstan',
  'Kenia': 'Kenya', 'Kirguistán': 'Kyrgyzstan', 'Lesoto': 'Lesotho', 'Letonia': 'Latvia', 'Líbano': 'Lebanon',
  'Libia': 'Libya', 'Lituania': 'Lithuania', 'Luxemburgo': 'Luxembourg', 'Macao': 'Macau', 'Macedonia del Norte': 'North Macedonia',
  'Malasia': 'Malaysia', 'Malaui': 'Malawi', 'Malí': 'Mali', 'Malvinas': 'Falkland Islands', 'Marruecos': 'Morocco',
  'Mauricio': 'Mauritius', 'México': 'Mexico', 'Moldavia': 'Moldova', 'Mónaco': 'Monaco', 'Níger': 'Niger',
  'Noruega': 'Norway', 'Nueva Caledonia': 'New Caledonia', 'Nueva Zelanda': 'New Zealand', 'Omán': 'Oman',
  'Países Bajos': 'Netherlands', 'Pakistán': 'Pakistan', 'Palaos': 'Palau', 'Panamá': 'Panama',
  'Papúa Nueva Guinea': 'Papua New Guinea', 'Perú': 'Peru', 'Polinesia Francesa': 'French Polynesia', 'Polonia': 'Poland',
  'R. D. del Congo': 'DR Congo', 'Reino Unido': 'United Kingdom', 'República Checa': 'Czech Republic',
  'República Dominicana': 'Dominican Republic', 'Reunión': 'Réunion', 'Ruanda': 'Rwanda', 'Rumanía': 'Romania',
  'Rusia': 'Russia', 'Sáhara Occidental': 'Western Sahara', 'Santa Lucía': 'Saint Lucia', 'Santo Tomé': 'São Tomé',
  'Serbia': 'Serbia', 'Sierra Leona': 'Sierra Leone', 'Singapur': 'Singapore', 'Siria': 'Syria', 'Sudáfrica': 'South Africa',
  'Sudán': 'Sudan', 'Sudán del Sur': 'South Sudan', 'Suecia': 'Sweden', 'Suiza': 'Switzerland', 'Surinam': 'Suriname',
  'Tailandia': 'Thailand', 'Taiwán': 'Taiwan', 'Trinidad y Tobago': 'Trinidad & Tobago', 'Túnez': 'Tunisia',
  'Turquía': 'Turkey', 'Ucrania': 'Ukraine', 'Uzbekistán': 'Uzbekistan', 'Vaticano': 'Vatican', 'Yemen': 'Yemen',
  'Yibuti': 'Djibouti', 'Zimbabue': 'Zimbabwe',
}

// Nombre del país (entidad DXCC) en el idioma de la interfaz.
export const countryName = (entity: string): string => (getLocale() === 'en' ? (EN[entity] ?? entity) : entity)
