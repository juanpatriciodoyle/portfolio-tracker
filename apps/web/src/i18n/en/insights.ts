/** The sentences the home screen writes about the person's own figures: what drove the profit, inflation, and their goals. */
export const insights = {
  'story.made': { one: '{names} made {amount}.', other: '{names} made {amount}.' },
  'story.mostlyOne': 'Most of your profit comes from one holding: {name}.',
  'story.down': '{name} is down {amount}.',
  'story.lost': '{name} lost {amount}.',
  'story.index.less': 'The same money in a world index fund would be worth {amount} less today, before fees and tax.',
  'story.index.more': 'The same money in a world index fund would be worth {amount} more today, before fees and tax.',
  'story.index.same': 'The same money in a world index fund would be worth about the same today, before fees and tax.',

  'hero.inflation.both': '{before} before inflation, {after} after inflation',
  'hero.inflation.on': '{before} before inflation',
  'hero.inflationNote': 'After the rise in prices in {country}, about {rate}% a year (official consumer price figures).',

  'goals.section': 'Your month',
  'goals.label.keep': 'What you keep',
  'goals.label.pays': 'What your portfolio could pay',
  'goals.keep': 'You keep about {amount} a month after fixed costs.',
  'goals.shortfall': 'Your fixed costs are about {amount} a month more than you earn.',
  'goals.pays': 'At {yield}% a year, your portfolio could pay about {amount} a month.',
  'goals.pays.covers': "That's {percent}% of your monthly living costs.",
  'goals.prompt': 'Add where you live and what you earn to see what your portfolio could cover.',
  'goals.promptAction': 'Tell us about yourself',
  'goals.more': 'More in your profile',

  'firstTransaction.title': 'Add your first transaction',
  'firstTransaction.intro': 'Tell us about your first transaction and your total value appears here.',
  'firstTransaction.nextBefore': 'After that, ',
  'firstTransaction.nextLink': 'tell us about yourself',
  'firstTransaction.nextAfter': ' (2 minutes) to see what your portfolio could cover.',
  'firstTransaction.empty.title': 'Nothing here yet',
  'firstTransaction.empty.note': 'Add your first transaction and your total value appears here.',
  'firstTransaction.empty.action': 'Add transaction',

  'homeError.title': 'We could not load your portfolio',
  'homeError.body': 'Nothing is lost. Check your connection and try again.',
  'homeError.retry': 'Try again',

} as const;
