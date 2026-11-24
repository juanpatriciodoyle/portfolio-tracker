import type { Translated } from '../types';
import type { insights as english } from '../en/insights';

export const insights: Translated<typeof english> = {
  'story.made': { one: '{names} ganó {amount}.', other: '{names} ganaron {amount}.' },
  'story.mostlyOne': 'La mayor parte de tu ganancia viene de una sola tenencia: {name}.',
  'story.down': '{name} acumula una pérdida de {amount}.',
  'story.lost': '{name} perdió {amount}.',
  'story.index.less': 'La misma plata en un fondo indexado mundial valdría {amount} menos hoy, antes de comisiones e impuestos.',
  'story.index.more': 'La misma plata en un fondo indexado mundial valdría {amount} más hoy, antes de comisiones e impuestos.',
  'story.index.same': 'La misma plata en un fondo indexado mundial valdría más o menos lo mismo hoy, antes de comisiones e impuestos.',

  'hero.inflation.both': '{before} antes de la inflación, {after} después de la inflación',
  'hero.inflation.on': '{before} antes de la inflación',
  'hero.inflationNote': 'Según la suba de precios en {country}: cerca de {rate}% por año (cifras oficiales de precios al consumidor).',

  'goals.section': 'Tu mes',
  'goals.label.keep': 'Lo que te queda',
  'goals.label.pays': 'Lo que podría pagar tu portfolio',
  'goals.keep': 'Te quedan unos {amount} por mes después de los costos fijos.',
  'goals.shortfall': 'Tus costos fijos superan tus ingresos en unos {amount} por mes.',
  'goals.pays': 'Con un {yield}% anual, tu portfolio podría pagar unos {amount} por mes.',
  'goals.pays.covers': 'Eso es el {percent}% de tus costos de vida mensuales.',
  'goals.prompt': 'Sumá dónde vivís y cuánto ganás para ver qué podría cubrir tu portfolio.',
  'goals.promptAction': 'Contanos sobre vos',
  'goals.more': 'Más en tu perfil',

  'firstTransaction.title': 'Agregá tu primera transacción',
  'firstTransaction.intro': 'Contanos tu primera transacción y acá aparece tu valor total.',
  'firstTransaction.nextBefore': 'Después, ',
  'firstTransaction.nextLink': 'contanos sobre vos',
  'firstTransaction.nextAfter': ' (2 minutos) para ver qué podría cubrir tu portfolio.',
  'firstTransaction.empty.title': 'Todavía no hay nada',
  'firstTransaction.empty.note': 'Agregá tu primera transacción y acá aparece tu valor total.',
  'firstTransaction.empty.action': 'Agregar transacción',

  'homeError.title': 'No pudimos cargar tu portfolio',
  'homeError.body': 'No se perdió nada. Revisá tu conexión y probá de nuevo.',
  'homeError.retry': 'Probar de nuevo',

};
