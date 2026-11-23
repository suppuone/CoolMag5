(() => {
  'use strict';

  const OFFICIAL = [
    'akashvani', 'all india radio', 'vividh bharati', 'bbc', 'npr', 'voa', 'dw', 'rfi'
  ];
  const ERA = [
    'retro', 'oldies', 'classic', 'classics', 'golden', 'evergreen', 'vintage', 'nostalgia',
    'throwback', 'legends', 'vinyl', 'gramophone', 'purani', 'yaadein',
    '50s', '60s', '70s', '80s', '90s', "50's", "60's", "70's", "80's", "90's",
    '1950s', '1960s', '1970s', '1980s', '1990s'
  ];
  const TAMIL = [
    'tms', 'soundararajan', 'susheela', 'janaki', 'sreenivas', 'pbs', 'spb', 's.p.b',
    'balasubrahmanyam', 'yesudas', 'k.j.yesudas', 'malaysia vasudevan', 'eswari', 'chithra',
    'sirkazhi', 'jikki', 'a.m. rajah', 'chandrababu', 'ilaiyaraaja', 'ilayaraja', 'msv',
    'viswanathan', 'ramamoorthy', 'k.v. mahadevan', 'kvm', 'g. ramanathan',
    'sankar ganesh', 'shankar ganesh', 'gangai amaran'
  ];
  const HINDI = [
    'kishore kumar', 'kishore', 'mohammed rafi', 'mohd rafi', 'rafi', 'lata mangeshkar',
    'lata', 'asha bhosle', 'mukesh', 'manna dey', 'hemant kumar', 'talat mahmood',
    'geeta dutt', 'mahendra kapoor', 'shamshad begum', 'jagjit singh', 'kumar sanu',
    'udit narayan', 'alka yagnik', 'r.d. burman', 'rd burman', 'r.d.burman', 'pancham',
    's.d. burman', 'sd burman', 'naushad', 'shankar jaikishan', 'laxmikant pyarelal',
    'kalyanji anandji', 'o.p. nayyar', 'op nayyar', 'madan mohan', 'salil chowdhury',
    'khayyam', 'roshan', 'bappi lahiri', 'nadeem shravan'
  ];
  const MALAYALAM_TELUGU_KANNADA = [
    'ghantasala', 'p. leela', 'devarajan', 'baburaj', 'dakshinamoorthy', 'raveendran',
    'johnson master', 'rajan nagendra', 'hamsalekha'
  ];
  const WESTERN = [
    'sinatra', 'elvis', 'nat king cole', 'dean martin', 'bing crosby', 'louis armstrong',
    'ella fitzgerald', 'beatles', 'pink floyd', 'abba', 'bee gees', 'carpenters',
    'cliff richard', 'jim reeves', 'johnny cash'
  ];
  const BROADCAST = [
    'fm', 'am', 'mhz', 'khz', 'simulcast', 'terrestrial', 'live', 'on air', 'on-air', 'talk',
    'news', 'bulletin', 'world service', 'public radio', 'community', 'sports', 'commentary',
    'cricket', 'broadcast', 'dab'
  ];
  const ERA_YEARS = Array.from({length: 41}, (_, index) => String(1950 + index));
  const escapeRegex = term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const compile = terms => new RegExp('\\b(?:' + terms.map(escapeRegex).join('|') + ')\\b', 'i');
  const official = compile(OFFICIAL);
  const goldenEra = compile([...ERA, ...ERA_YEARS, ...TAMIL, ...HINDI, ...MALAYALAM_TELUGU_KANNADA, ...WESTERN]);
  const broadcast = compile(BROADCAST);

  function getStationCategory(station) {
    const name = String(station?.name ?? '');
    const metadata = [name, station?.tags, station?.genre].flat(Infinity)
      .filter(value => typeof value === 'string' || typeof value === 'number').join(' ');
    if (/\bAIR\b/.test(name) || official.test(metadata)) return 'RADIO_TOWER';
    // A station can explicitly request cassette artwork for its curated presentation.
    if (station?.artworkCategory === 'CASSETTE') return 'CASSETTE';
    if (goldenEra.test(metadata)) return 'LP_RECORD';
    if (broadcast.test(metadata)) return 'RADIO_TOWER';
    return 'CASSETTE';
  }

  const icons = {
    RADIO_TOWER: '<path d="M7 14 12 5l5 9M12 5v15M5 20h14M8 11a5 5 0 0 1 0-7m8 0a5 5 0 0 1 0 7M5 13A9 9 0 0 1 5 2m14 0a9 9 0 0 1 0 11"/>',
    LP_RECORD: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/><path d="M5 12a7 7 0 0 1 7-7m7 7a7 7 0 0 1-7 7"/>',
    CASSETTE: '<rect x="2" y="5" width="20" height="14" rx="2"/><rect x="5" y="8" width="14" height="5" rx="2.5"/><path d="m6 19 2-3h8l2 3M8 10.5h.01m7.99 0h.01"/>'
  };

  function stationCategoryIcon(category) {
    return '<svg aria-hidden="true" class="station-category-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-.2em;margin-inline-end:.35em">' +
      icons[category] + '</svg>';
  }

  window.getStationCategory = getStationCategory;
  window.stationCategoryIcon = stationCategoryIcon;
})();
