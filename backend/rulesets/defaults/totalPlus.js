module.exports = {
  id: 'totalPlus',
  label: 'Total Plus',
  abbreviation: 'T+',
  type: 'per_round',
  code: [
    '# Total Plus combines King of Hearts, Diamonds, Queens, 10 of Clubs, and Whist.',
    '# All scoring effects are positive.',
    'add(100, HEART_KING)',
    'add(15 * DIAMOND_NR, DIAMOND_NR > 0)',
    'add(30 * Q_NR, Q_NR > 0)',
    'add(100, CLUB_TEN)',
    'add(10)'
  ].join('\n'),
  enabledByDefault: true
};
