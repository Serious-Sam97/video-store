export class JellyfinClient {
  constructor(serverUrl, token, userId) {
    this.serverUrl = new URL(serverUrl).origin;
    this.token  = token;
    this.userId = userId;
  }

  // Authenticate with username + password, returns a ready JellyfinClient
  static async login(serverUrl, username, password) {
    // Keep only origin (scheme + host + port), strip any path the user may have pasted
    const parsed = new URL(serverUrl.trim());
    const base   = parsed.origin; // e.g. "http://100.125.100.33:8096"
    // Match exactly what the official Jellyfin Web client sends
    const clientStr = 'MediaBrowser Client="VideoVault", Device="Browser", DeviceId="videovault-web", Version="1.0.0", Token=""';

    let res;
    try {
      res = await fetch(`${base}/Users/AuthenticateByName`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': clientStr,
        },
        body: JSON.stringify({ Username: username, Pw: password }),
      });
    } catch (networkErr) {
      // fetch() itself threw — server unreachable or CORS blocked
      throw new Error(
        `Could not reach the server.\n\n` +
        `• Check the URL is correct (e.g. http://192.168.1.10:8096)\n` +
        `• If the server is on HTTPS, make sure the certificate is trusted\n` +
        `• CORS: open your Jellyfin dashboard → Advanced → Networking and ensure ` +
        `the app's origin is allowed\n\nBrowser error: ${networkErr.message}`
      );
    }

    if (!res.ok) {
      let detail = '';
      try { detail = await res.text(); } catch (_) {}
      console.error('Jellyfin auth failed', res.status, detail);

      if (res.status === 401) {
        throw new Error(`401 Unauthorized — Jellyfin rejected the credentials.\nServer response: ${detail || '(empty)'}`);
      }
      throw new Error(`HTTP ${res.status} ${res.statusText}\n${detail}`);
    }

    const data = await res.json();
    if (!data.AccessToken || !data.User?.Id) {
      throw new Error('Unexpected response from Jellyfin — missing token or user ID.');
    }
    return new JellyfinClient(base, data.AccessToken, data.User.Id);
  }

  _authHeader() {
    return `MediaBrowser Client="VideoVault", Device="Browser", DeviceId="videovault-web", Version="1.0.0", Token="${this.token}"`;
  }

  _headers() {
    return { 'Authorization': this._authHeader() };
  }

  async getTVShows(limit = 500) {
    const params = new URLSearchParams({
      IncludeItemTypes: 'Series',
      Recursive: 'true',
      Fields: 'Overview,OfficialRating,ProductionYear,CommunityRating,Genres,ChildCount',
      SortBy: 'SortName',
      SortOrder: 'Ascending',
      Limit: limit,
    });
    const res = await fetch(`${this.serverUrl}/Users/${this.userId}/Items?${params}`, {
      headers: this._headers(),
    });
    if (!res.ok) throw new Error(`Jellyfin ${res.status}: ${res.statusText}`);
    const data = await res.json();
    return (data.Items || []).map(s => ({ ...s, isTVShow: true }));
  }

  async getMovies(limit = 500) {
    const params = new URLSearchParams({
      IncludeItemTypes: 'Movie',
      Recursive: 'true',
      Fields: 'Overview,RunTimeTicks,OfficialRating,ProductionYear,CommunityRating,Genres',
      SortBy: 'SortName',
      SortOrder: 'Ascending',
      Limit: limit,
    });
    const res = await fetch(`${this.serverUrl}/Users/${this.userId}/Items?${params}`, {
      headers: this._headers(),
    });
    if (!res.ok) throw new Error(`Jellyfin ${res.status}: ${res.statusText}`);
    const data = await res.json();
    return data.Items || [];
  }

  getImageUrl(itemId, width = 300) {
    // api_key in query string is still supported for image requests (no CORS preflight)
    return `${this.serverUrl}/Items/${itemId}/Images/Primary?width=${width}&api_key=${this.token}`;
  }

  getWebPlayerUrl(itemId) {
    return `${this.serverUrl}/web/index.html#!/details?id=${itemId}`;
  }
}

// ─── Demo TV shows ─────────────────────────────────────────────
export const DEMO_TV_SHOWS = [
  { Id:'tv01', Name:'The X-Files',              isTVShow:true, Genres:['Drama','Science Fiction'], ProductionYear:1993, CommunityRating:8.6, ChildCount:11, NumberOfEpisodes:217, Overview:'Two FBI agents investigate paranormal cases that may be linked to a vast government conspiracy.' },
  { Id:'tv02', Name:'Twin Peaks',               isTVShow:true, Genres:['Drama','Mystery'],         ProductionYear:1990, CommunityRating:8.8, ChildCount:3,  NumberOfEpisodes:48,  Overview:'An FBI agent investigates the murder of a homecoming queen in a small, secretive logging town.' },
  { Id:'tv03', Name:'The Sopranos',             isTVShow:true, Genres:['Drama','Crime'],           ProductionYear:1999, CommunityRating:9.2, ChildCount:6,  NumberOfEpisodes:86,  Overview:'A New Jersey mob boss balances family life with running his criminal organization.' },
  { Id:'tv04', Name:'Seinfeld',                 isTVShow:true, Genres:['Comedy'],                  ProductionYear:1989, CommunityRating:8.9, ChildCount:9,  NumberOfEpisodes:180, Overview:'A stand-up comedian and his three quirky friends navigate the absurdities of New York City life.' },
  { Id:'tv05', Name:'Friends',                  isTVShow:true, Genres:['Comedy','Romance'],        ProductionYear:1994, CommunityRating:8.9, ChildCount:10, NumberOfEpisodes:236, Overview:'Six friends navigate life, love, and careers in Manhattan.' },
  { Id:'tv06', Name:'Buffy the Vampire Slayer', isTVShow:true, Genres:['Fantasy','Action'],        ProductionYear:1997, CommunityRating:8.3, ChildCount:7,  NumberOfEpisodes:144, Overview:'A teenage girl chosen to fight vampires and other supernatural threats.' },
  { Id:'tv07', Name:'The Wire',                 isTVShow:true, Genres:['Drama','Crime'],           ProductionYear:2002, CommunityRating:9.3, ChildCount:5,  NumberOfEpisodes:60,  Overview:'The Baltimore drug scene is portrayed through the eyes of law enforcement and drug dealers alike.' },
  { Id:'tv08', Name:'ER',                       isTVShow:true, Genres:['Drama'],                   ProductionYear:1994, CommunityRating:8.0, ChildCount:15, NumberOfEpisodes:331, Overview:'The inner workings of a Chicago hospital emergency room are dramatized.' },
  { Id:'tv09', Name:'Oz',                       isTVShow:true, Genres:['Drama','Crime'],           ProductionYear:1997, CommunityRating:8.7, ChildCount:6,  NumberOfEpisodes:56,  Overview:'Life inside the experimental Emerald City unit of Oswald State Penitentiary.' },
  { Id:'tv10', Name:'The Twilight Zone',        isTVShow:true, Genres:['Science Fiction','Horror'],ProductionYear:1959, CommunityRating:9.0, ChildCount:5,  NumberOfEpisodes:156, Overview:'Anthology of self-contained tales involving ordinary people in extraordinary situations.' },
  { Id:'tv11', Name:'Star Trek: The Next Generation', isTVShow:true, Genres:['Science Fiction'],  ProductionYear:1987, CommunityRating:8.7, ChildCount:7,  NumberOfEpisodes:178, Overview:'The crew of the Enterprise-D explores the galaxy in the 24th century.' },
  { Id:'tv12', Name:'Quantum Leap',             isTVShow:true, Genres:['Science Fiction','Drama'], ProductionYear:1989, CommunityRating:7.9, ChildCount:5,  NumberOfEpisodes:97,  Overview:'A physicist leaps through time inhabiting other people\'s bodies to put right what once went wrong.' },
  { Id:'tv13', Name:'Cheers',                   isTVShow:true, Genres:['Comedy'],                  ProductionYear:1982, CommunityRating:8.2, ChildCount:11, NumberOfEpisodes:275, Overview:'The regulars at a Boston bar become a surrogate family for each other.' },
  { Id:'tv14', Name:'Northern Exposure',        isTVShow:true, Genres:['Comedy','Drama'],          ProductionYear:1990, CommunityRating:8.1, ChildCount:6,  NumberOfEpisodes:110, Overview:'A New York doctor is forced to practice medicine in a small Alaska town.' },
  { Id:'tv15', Name:'Homicide: Life on the Street', isTVShow:true, Genres:['Drama','Crime'],      ProductionYear:1993, CommunityRating:8.6, ChildCount:7,  NumberOfEpisodes:122, Overview:'The cases and personal lives of Baltimore homicide detectives.' },
  { Id:'tv16', Name:'Babylon 5',                isTVShow:true, Genres:['Science Fiction','Drama'], ProductionYear:1993, CommunityRating:8.3, ChildCount:5,  NumberOfEpisodes:110, Overview:'A space station serves as neutral ground for a multitude of alien races.' },
  { Id:'tv17', Name:'NYPD Blue',                isTVShow:true, Genres:['Drama','Crime'],           ProductionYear:1993, CommunityRating:7.9, ChildCount:12, NumberOfEpisodes:261, Overview:'New York City detectives tackle serious crimes and personal demons.' },
  { Id:'tv18', Name:'The Simpsons',             isTVShow:true, Genres:['Comedy','Animation'],      ProductionYear:1989, CommunityRating:8.7, ChildCount:35, NumberOfEpisodes:768, Overview:'The daily life of the Simpson family in the fictional town of Springfield.' },
];

// ─── Demo movies (80s/90s classics) ───────────────────────────
export const DEMO_MOVIES = [
  { Id:'d01', Name:'The Matrix',               Genres:['Science Fiction'],      ProductionYear:1999, CommunityRating:8.7, OfficialRating:'R',     RunTimeTicks:82800000000, Overview:'A computer hacker discovers the truth about reality and joins a rebellion against its machine controllers.' },
  { Id:'d02', Name:'Blade Runner',             Genres:['Science Fiction'],      ProductionYear:1982, CommunityRating:8.1, OfficialRating:'R',     RunTimeTicks:73800000000, Overview:'A blade runner must pursue and terminate four replicants who stole a ship in space and returned to Earth.' },
  { Id:'d03', Name:'The Terminator',           Genres:['Action','Science Fiction'], ProductionYear:1984, CommunityRating:8.0, OfficialRating:'R',  RunTimeTicks:64800000000, Overview:'A human soldier is sent from 2029 to 1984 to stop a cyborg assassin.' },
  { Id:'d04', Name:'Back to the Future',       Genres:['Science Fiction','Comedy'], ProductionYear:1985, CommunityRating:8.5, OfficialRating:'PG', RunTimeTicks:69600000000, Overview:'Marty McFly is accidentally sent 30 years into the past in a time-traveling DeLorean.' },
  { Id:'d05', Name:'Ghostbusters',             Genres:['Comedy','Fantasy'],     ProductionYear:1984, CommunityRating:7.8, OfficialRating:'PG',    RunTimeTicks:64800000000, Overview:'Three parapsychology professors lose their jobs and decide to become ghost-catchers in New York City.' },
  { Id:'d06', Name:'RoboCop',                  Genres:['Action','Science Fiction'], ProductionYear:1987, CommunityRating:7.5, OfficialRating:'R',  RunTimeTicks:68400000000, Overview:'In crime-ridden Detroit, a fatally wounded cop returns to the force as a powerful cyborg.' },
  { Id:'d07', Name:'Total Recall',             Genres:['Action','Science Fiction'], ProductionYear:1990, CommunityRating:7.5, OfficialRating:'R',  RunTimeTicks:72000000000, Overview:'A construction worker discovers that his memories of a vacation to Mars are actually implanted.' },
  { Id:'d08', Name:'Predator',                 Genres:['Action','Science Fiction'], ProductionYear:1987, CommunityRating:7.8, OfficialRating:'R',  RunTimeTicks:64800000000, Overview:'An elite mercenary team in a Central American jungle is hunted by an extraterrestrial warrior.' },
  { Id:'d09', Name:'Die Hard',                 Genres:['Action','Thriller'],    ProductionYear:1988, CommunityRating:8.2, OfficialRating:'R',     RunTimeTicks:72000000000, Overview:'An NYPD officer tries to save hostages taken by German terrorists during a Christmas party.' },
  { Id:'d10', Name:'Aliens',                   Genres:['Action','Science Fiction'], ProductionYear:1986, CommunityRating:8.4, OfficialRating:'R',  RunTimeTicks:72000000000, Overview:'Ellen Ripley must fight deadly creatures alongside a unit of marines.' },
  { Id:'d11', Name:'The Thing',                Genres:['Horror','Science Fiction'], ProductionYear:1982, CommunityRating:8.1, OfficialRating:'R',  RunTimeTicks:64800000000, Overview:'A research team in Antarctica is hunted by a shape-shifting alien.' },
  { Id:'d12', Name:'Escape from New York',     Genres:['Action','Science Fiction'], ProductionYear:1981, CommunityRating:7.2, OfficialRating:'R',  RunTimeTicks:64800000000, Overview:'In a dystopian future, Snake Plissken must rescue the U.S. President from prison Manhattan.' },
  { Id:'d13', Name:'Full Metal Jacket',        Genres:['War','Drama'],          ProductionYear:1987, CommunityRating:8.3, OfficialRating:'R',     RunTimeTicks:72000000000, Overview:'A U.S. Marine observes the dehumanizing effects of the Vietnam War.' },
  { Id:'d14', Name:'Top Gun',                  Genres:['Action','Drama'],       ProductionYear:1986, CommunityRating:6.9, OfficialRating:'PG',    RunTimeTicks:64800000000, Overview:'An elite fighter pilot competes at the Navy\'s top weapons school.' },
  { Id:'d15', Name:'Beverly Hills Cop',        Genres:['Action','Comedy'],      ProductionYear:1984, CommunityRating:7.3, OfficialRating:'R',     RunTimeTicks:64800000000, Overview:'A street-wise Detroit cop investigates his friend\'s murder in Beverly Hills.' },
  { Id:'d16', Name:'The Goonies',              Genres:['Adventure','Comedy'],   ProductionYear:1985, CommunityRating:7.8, OfficialRating:'PG',    RunTimeTicks:68400000000, Overview:'A group of young misfits discover a treasure map and go on a wild adventure.' },
  { Id:'d17', Name:'Ferris Bueller\'s Day Off',Genres:['Comedy'],               ProductionYear:1986, CommunityRating:7.8, OfficialRating:'PG-13', RunTimeTicks:64800000000, Overview:'A high school wise guy takes the day off while dragging his best friend and girlfriend around Chicago.' },
  { Id:'d18', Name:'Beetlejuice',              Genres:['Comedy','Fantasy'],     ProductionYear:1988, CommunityRating:7.5, OfficialRating:'PG',    RunTimeTicks:63600000000, Overview:'A couple of ghosts hire a bio-exorcist to remove the new family from their home.' },
  { Id:'d19', Name:'Raiders of the Lost Ark',  Genres:['Action','Adventure'],   ProductionYear:1981, CommunityRating:8.4, OfficialRating:'PG',    RunTimeTicks:70800000000, Overview:'Indiana Jones races against the Nazis to find the mystical Ark of the Covenant.' },
  { Id:'d20', Name:'E.T.',                     Genres:['Science Fiction','Drama'], ProductionYear:1982, CommunityRating:7.9, OfficialRating:'PG',  RunTimeTicks:68400000000, Overview:'A child helps a friendly alien escape Earth and return to his home world.' },
  { Id:'d21', Name:'Gremlins',                 Genres:['Comedy','Horror'],      ProductionYear:1984, CommunityRating:7.2, OfficialRating:'PG',    RunTimeTicks:64800000000, Overview:'A boy breaks three rules about his new pet and unleashes malevolent creatures on a small town.' },
  { Id:'d22', Name:'Poltergeist',              Genres:['Horror'],               ProductionYear:1982, CommunityRating:7.3, OfficialRating:'PG',    RunTimeTicks:64800000000, Overview:'A family\'s home is haunted by demonic ghosts targeting their youngest daughter.' },
  { Id:'d23', Name:'Scarface',                 Genres:['Crime','Drama'],        ProductionYear:1983, CommunityRating:8.3, OfficialRating:'R',     RunTimeTicks:90000000000, Overview:'In 1980 Miami, a determined Cuban immigrant takes over a drug cartel.' },
  { Id:'d24', Name:'Tron',                     Genres:['Science Fiction','Adventure'], ProductionYear:1982, CommunityRating:6.8, OfficialRating:'PG', RunTimeTicks:64800000000, Overview:'A hacker is transported into the digital world and forced to compete in gladiatorial games.' },
  { Id:'d25', Name:'Flash Gordon',             Genres:['Science Fiction','Adventure'], ProductionYear:1980, CommunityRating:6.8, OfficialRating:'PG', RunTimeTicks:64800000000, Overview:'A football player travels to planet Mongo to save Earth from the evil Ming the Merciless.' },
  { Id:'d26', Name:'Conan the Barbarian',      Genres:['Action','Fantasy'],     ProductionYear:1982, CommunityRating:6.9, OfficialRating:'R',     RunTimeTicks:72000000000, Overview:'A barbarian warrior pursues vengeance against the sorcerer who killed his parents.' },
  { Id:'d27', Name:'WarGames',                 Genres:['Thriller','Science Fiction'], ProductionYear:1983, CommunityRating:7.1, OfficialRating:'PG', RunTimeTicks:68400000000, Overview:'A young hacker accidentally nearly triggers World War III via a NORAD simulation.' },
  { Id:'d28', Name:'Platoon',                  Genres:['War','Drama'],          ProductionYear:1986, CommunityRating:8.1, OfficialRating:'R',     RunTimeTicks:72000000000, Overview:'A soldier faces a moral crisis confronting the horrors of the Vietnam War.' },
  { Id:'d29', Name:'The Breakfast Club',       Genres:['Drama','Comedy'],       ProductionYear:1985, CommunityRating:7.9, OfficialRating:'R',     RunTimeTicks:64800000000, Overview:'Five very different high school students bond during a day of Saturday detention.' },
  { Id:'d30', Name:'Pretty in Pink',           Genres:['Romance','Drama'],      ProductionYear:1986, CommunityRating:6.7, OfficialRating:'PG-13', RunTimeTicks:60000000000, Overview:'A girl from a lower-class family falls for a rich boy.' },
  { Id:'d31', Name:'Weird Science',            Genres:['Comedy','Science Fiction'], ProductionYear:1985, CommunityRating:6.6, OfficialRating:'PG-13', RunTimeTicks:60000000000, Overview:'Two nerdy teenagers accidentally conjure a real-life genie.' },
  { Id:'d32', Name:'Short Circuit',            Genres:['Comedy','Science Fiction'], ProductionYear:1986, CommunityRating:6.5, OfficialRating:'PG', RunTimeTicks:64800000000, Overview:'A military robot struck by lightning gains self-awareness.' },
  { Id:'d33', Name:'Footloose',                Genres:['Drama','Music'],        ProductionYear:1984, CommunityRating:6.7, OfficialRating:'PG',    RunTimeTicks:63600000000, Overview:'A city kid moves to a small town where rock music and dancing have been banned.' },
  { Id:'d34', Name:'Dirty Dancing',            Genres:['Romance','Drama'],      ProductionYear:1987, CommunityRating:7.1, OfficialRating:'PG-13', RunTimeTicks:64800000000, Overview:'A young woman falls in love with the dance instructor at a summer resort.' },
  { Id:'d35', Name:'RoboCop 2',                Genres:['Action','Science Fiction'], ProductionYear:1990, CommunityRating:5.8, OfficialRating:'R',  RunTimeTicks:64800000000, Overview:'The cyborg cop battles a new, more powerful cyborg villain.' },
  { Id:'d36', Name:'Misery',                   Genres:['Horror','Thriller'],    ProductionYear:1990, CommunityRating:7.8, OfficialRating:'R',     RunTimeTicks:65400000000, Overview:'A famous novelist is held captive by an obsessive fan after a car accident.' },
];
