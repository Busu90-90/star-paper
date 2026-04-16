(function () {
    const SCHEMA_VERSION_KEY = 'starPaperSchemaVersion';
    const TARGET_SCHEMA_VERSION = 4;

    function parseJson(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return fallback;
            return JSON.parse(raw);
        } catch {
            return fallback;
        }
    }

    function writeJson(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    }

    function normalizeUserRecord(user) {
        const safeUser = user && typeof user === 'object' ? user : {};
        return {
            ...safeUser,
            userType: typeof safeUser.userType === 'string' ? safeUser.userType : 'user',
            email: typeof safeUser.email === 'string' ? safeUser.email : '',
            phone: typeof safeUser.phone === 'string' ? safeUser.phone : '',
            specialty: typeof safeUser.specialty === 'string' ? safeUser.specialty : '',
            bio: typeof safeUser.bio === 'string' ? safeUser.bio : '',
            bookings: Array.isArray(safeUser.bookings) ? safeUser.bookings : [],
            expenses: Array.isArray(safeUser.expenses) ? safeUser.expenses : [],
            otherIncome: Array.isArray(safeUser.otherIncome) ? safeUser.otherIncome : [],
            lastLogin: typeof safeUser.lastLogin === 'string' || safeUser.lastLogin === null ? safeUser.lastLogin : null
        };
    }

    function normalizeMessagesAndTheme() {
        const messages = parseJson('starPaperMessages', []);
        const migratedMessages = Array.isArray(messages)
            ? messages.map((msg) => ({
                ...msg,
                archivedBy: Array.isArray(msg?.archivedBy) ? msg.archivedBy : [],
                starredBy: Array.isArray(msg?.starredBy) ? msg.starredBy : []
            }))
            : [];

        const theme = localStorage.getItem('starPaperTheme');
        if (theme !== 'light' && theme !== 'dark') {
            localStorage.setItem('starPaperTheme', 'dark');
        }

        writeJson('starPaperMessages', migratedMessages);
    }

    function migrateToV1() {
        const users = parseJson('starPaperUsers', {});
        const migratedUsers = {};

        if (users && typeof users === 'object' && !Array.isArray(users)) {
            Object.keys(users).forEach((username) => {
                migratedUsers[username] = normalizeUserRecord(users[username]);
            });
        }

        writeJson('starPaperUsers', migratedUsers);
        normalizeMessagesAndTheme();
    }

    function normalizeName(value) {
        return String(value || '').trim().replace(/\s+/g, ' ');
    }

    function normalizeIdChunk(value, fallback) {
        const cleaned = String(value || '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
        return cleaned || fallback;
    }

    function stableHash(input) {
        const str = String(input || '');
        let hash = 0;
        for (let i = 0; i < str.length; i += 1) {
            hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
        }
        return Math.abs(hash).toString(36);
    }

    function createStableId(prefix, seed, used) {
        const base = normalizeIdChunk(seed, prefix);
        let id = `${prefix}_${base}_${stableHash(seed).slice(0, 6)}`;
        let suffix = 1;
        while (used.has(id)) {
            id = `${prefix}_${base}_${stableHash(`${seed}_${suffix}`).slice(0, 6)}`;
            suffix += 1;
        }
        used.add(id);
        return id;
    }

    function hasFinancialArrays(record) {
        return Array.isArray(record?.bookings) || Array.isArray(record?.expenses) || Array.isArray(record?.otherIncome);
    }

    function isLikelyArtistRecord(username, record) {
        if (!record || typeof record !== 'object') return false;
        if (record.userType === 'artist') return true;
        const hasArtistProfile = Boolean(record.specialty || record.bio);
        const noFinancials = !hasFinancialArrays(record);
        return username !== 'Admin' && hasArtistProfile && noFinancials;
    }

    function cloneFinancials(record) {
        return {
            bookings: Array.isArray(record?.bookings) ? record.bookings.map((b) => ({ ...b })) : [],
            expenses: Array.isArray(record?.expenses) ? record.expenses.map((e) => ({ ...e })) : [],
            otherIncome: Array.isArray(record?.otherIncome) ? record.otherIncome.map((i) => ({ ...i })) : []
        };
    }

    function migrateToV2UserArtistSeparation() {
        const rawUsers = parseJson('starPaperUsers', {});
        const existingArtists = parseJson('starPaperArtists', null);
        const alreadyMigrated = Array.isArray(rawUsers) && Array.isArray(existingArtists);
        const rawExistingCredentials = parseJson('starPaperCredentials', {});
        const existingCredentials = (rawExistingCredentials && typeof rawExistingCredentials === 'object' && !Array.isArray(rawExistingCredentials))
            ? rawExistingCredentials
            : {};

        if (alreadyMigrated) {
            const existingManagerData = parseJson('starPaperManagerData', {});
            writeJson('starPaperUsers', rawUsers);
            writeJson('starPaperArtists', existingArtists);
            writeJson('starPaperManagerData', (existingManagerData && typeof existingManagerData === 'object' && !Array.isArray(existingManagerData)) ? existingManagerData : {});
            writeJson('starPaperCredentials', (existingCredentials && typeof existingCredentials === 'object' && !Array.isArray(existingCredentials)) ? existingCredentials : {});
            return;
        }

        const legacyUsers = rawUsers && typeof rawUsers === 'object' && !Array.isArray(rawUsers) ? rawUsers : {};
        const usernames = Object.keys(legacyUsers);

        const managerIdUsed = new Set();
        const artistIdUsed = new Set();

        const managers = [];
        const managerByUsername = new Map();
        const managerData = {};
        const credentials = {};

        function findExistingCredential(username) {
            const direct = existingCredentials[username];
            if (direct && typeof direct === 'object' && typeof direct.password === 'string') {
                return {
                    password: direct.password,
                    createdAt: typeof direct.createdAt === 'string' ? direct.createdAt : new Date().toISOString()
                };
            }

            const normalized = String(username || '').trim().toLowerCase();
            if (!normalized) return null;
            const matchKey = Object.keys(existingCredentials).find((key) => String(key || '').trim().toLowerCase() === normalized);
            if (!matchKey) return null;
            const match = existingCredentials[matchKey];
            if (!match || typeof match !== 'object' || typeof match.password !== 'string') return null;
            return {
                password: match.password,
                createdAt: typeof match.createdAt === 'string' ? match.createdAt : new Date().toISOString()
            };
        }

        usernames.forEach((username) => {
            const record = normalizeUserRecord(legacyUsers[username]);
            const explicitArtist = record.userType === 'artist';
            const managerCandidate = !explicitArtist || hasFinancialArrays(record);
            if (!managerCandidate) {
                return;
            }

            const managerId = createStableId('mgr', username, managerIdUsed);
            const createdAt = typeof record.createdAt === 'string' ? record.createdAt : new Date().toISOString();
            const manager = {
                id: managerId,
                username,
                email: record.email || '',
                avatar: typeof record.avatar === 'string' ? record.avatar : '',
                createdAt
            };

            managers.push(manager);
            managerByUsername.set(username, manager);
            managerData[managerId] = cloneFinancials(record);

            const legacyPassword = typeof record.password === 'string' ? record.password : null;
            const existingCredential = findExistingCredential(username);
            if (legacyPassword !== null || existingCredential) {
                credentials[username] = {
                    password: legacyPassword !== null ? legacyPassword : existingCredential.password,
                    createdAt: existingCredential?.createdAt || createdAt
                };
            }
        });

        if (managers.length === 0 && usernames.length > 0) {
            const username = usernames[0];
            const fallbackRecord = normalizeUserRecord(legacyUsers[username]);
            const managerId = createStableId('mgr', username, managerIdUsed);
            const createdAt = typeof fallbackRecord.createdAt === 'string' ? fallbackRecord.createdAt : new Date().toISOString();
            managers.push({
                id: managerId,
                username,
                email: fallbackRecord.email || '',
                avatar: typeof fallbackRecord.avatar === 'string' ? fallbackRecord.avatar : '',
                createdAt
            });
            managerByUsername.set(username, managers[0]);
            managerData[managerId] = cloneFinancials(fallbackRecord);
            const fallbackLegacyPassword = typeof fallbackRecord.password === 'string' ? fallbackRecord.password : null;
            const fallbackExistingCredential = findExistingCredential(username);
            if (fallbackLegacyPassword !== null || fallbackExistingCredential) {
                credentials[username] = {
                    password: fallbackLegacyPassword !== null ? fallbackLegacyPassword : fallbackExistingCredential.password,
                    createdAt: fallbackExistingCredential?.createdAt || createdAt
                };
            }
        }

        managers.forEach((manager) => {
            if (credentials[manager.username]) return;
            const existingCredential = findExistingCredential(manager.username);
            if (!existingCredential) return;
            credentials[manager.username] = existingCredential;
        });

        const managerArtistFrequency = {};
        managers.forEach((manager) => {
            const bookings = managerData[manager.id]?.bookings || [];
            managerArtistFrequency[manager.id] = {};
            bookings.forEach((booking) => {
                const artistName = normalizeName(booking?.artist);
                if (!artistName) return;
                managerArtistFrequency[manager.id][artistName] = (managerArtistFrequency[manager.id][artistName] || 0) + 1;
            });
        });

        const artistSeed = new Map();

        usernames.forEach((username) => {
            const record = normalizeUserRecord(legacyUsers[username]);
            if (!isLikelyArtistRecord(username, record)) return;
            const name = normalizeName(username);
            if (!name) return;
            if (!artistSeed.has(name)) {
                artistSeed.set(name, {
                    name,
                    email: record.email || '',
                    phone: record.phone || '',
                    specialty: record.specialty || '',
                    bio: record.bio || '',
                    createdAt: typeof record.createdAt === 'string' ? record.createdAt : new Date().toISOString()
                });
            }
        });

        Object.keys(managerData).forEach((managerId) => {
            (managerData[managerId]?.bookings || []).forEach((booking) => {
                const name = normalizeName(booking?.artist);
                if (!name) return;
                if (!artistSeed.has(name)) {
                    artistSeed.set(name, {
                        name,
                        email: '',
                        phone: '',
                        specialty: '',
                        bio: '',
                        createdAt: new Date().toISOString()
                    });
                }
            });
        });

        function pickManagerForArtist(artistName) {
            if (managers.length === 0) return null;
            let best = managers[0];
            let bestScore = -1;
            managers.forEach((manager) => {
                const score = managerArtistFrequency[manager.id]?.[artistName] || 0;
                if (score > bestScore) {
                    best = manager;
                    bestScore = score;
                }
            });
            return best;
        }

        const artists = [];
        const artistByName = new Map();

        artistSeed.forEach((seed, name) => {
            const owner = pickManagerForArtist(name) || managers[0] || null;
            if (!owner) return;
            const artist = {
                id: createStableId('artist', name, artistIdUsed),
                name,
                managerId: owner.id,
                createdAt: seed.createdAt || new Date().toISOString(),
                email: seed.email || '',
                phone: seed.phone || '',
                specialty: seed.specialty || '',
                bio: seed.bio || ''
            };
            artists.push(artist);
            artistByName.set(name, artist);
        });

        Object.keys(managerData).forEach((managerId) => {
            const bookings = managerData[managerId]?.bookings || [];
            managerData[managerId].bookings = bookings.map((booking) => {
                const artistName = normalizeName(booking?.artist);
                if (!artistName) {
                    return { ...booking, artistId: booking?.artistId || null };
                }

                let artist = artistByName.get(artistName);
                if (!artist) {
                    const fallbackOwner = managers.find((m) => m.id === managerId) || managers[0] || null;
                    if (!fallbackOwner) {
                        return { ...booking, artistId: booking?.artistId || null };
                    }
                    artist = {
                        id: createStableId('artist', artistName, artistIdUsed),
                        name: artistName,
                        managerId: fallbackOwner.id,
                        createdAt: new Date().toISOString(),
                        email: '',
                        phone: '',
                        specialty: '',
                        bio: ''
                    };
                    artists.push(artist);
                    artistByName.set(artistName, artist);
                }

                return {
                    ...booking,
                    artist: booking?.artist || artistName,
                    artistId: artist.id
                };
            });
        });

        writeJson('starPaperUsers', managers);
        writeJson('starPaperArtists', artists);
        writeJson('starPaperManagerData', managerData);
        writeJson('starPaperCredentials', credentials);
    }

    function migrateToV3AudienceMetricsAndCapacity() {
        const existingArtists = parseJson('starPaperArtists', []);
        if (Array.isArray(existingArtists)) {
            const updatedArtists = existingArtists.map((artist) => ({
                ...artist,
                strategicGoal: typeof artist?.strategicGoal === 'string' ? artist.strategicGoal : ''
            }));
            writeJson('starPaperArtists', updatedArtists);
        }

        const existingManagerData = parseJson('starPaperManagerData', {});
        if (existingManagerData && typeof existingManagerData === 'object' && !Array.isArray(existingManagerData)) {
            Object.keys(existingManagerData).forEach((key) => {
                const record = existingManagerData[key];
                if (!record || typeof record !== 'object') return;
                const bookings = Array.isArray(record.bookings) ? record.bookings.map((booking) => ({
                    ...booking,
                    capacity: Number.isFinite(Number(booking?.capacity)) ? Math.round(Number(booking.capacity)) : 0
                })) : [];
                existingManagerData[key] = {
                    ...record,
                    bookings
                };
            });
            writeJson('starPaperManagerData', existingManagerData);
        }

        const existingAudienceMetrics = parseJson('starPaperAudienceMetrics', {});
        if (!existingAudienceMetrics || typeof existingAudienceMetrics !== 'object' || Array.isArray(existingAudienceMetrics)) {
            writeJson('starPaperAudienceMetrics', {});
        }
    }

    function migrateToV4ArtistAvatar() {
        const existingArtists = parseJson('starPaperArtists', []);
        if (!Array.isArray(existingArtists)) return;
        const updatedArtists = existingArtists.map((artist) => ({
            ...artist,
            avatar: typeof artist?.avatar === 'string' ? artist.avatar : ''
        }));
        writeJson('starPaperArtists', updatedArtists);
    }

    function runStorageMigrations() {
        const rawVersion = Number(localStorage.getItem(SCHEMA_VERSION_KEY) || 0);
        let currentVersion = Number.isFinite(rawVersion) ? rawVersion : 0;

        if (currentVersion < 1) {
            migrateToV1();
            currentVersion = 1;
        }

        if (currentVersion < 2) {
            migrateToV2UserArtistSeparation();
            currentVersion = 2;
        }

        if (currentVersion < 3) {
            migrateToV3AudienceMetricsAndCapacity();
            currentVersion = 3;
        }

        if (currentVersion < 4) {
            migrateToV4ArtistAvatar();
            currentVersion = 4;
        }

        if (currentVersion < TARGET_SCHEMA_VERSION) {
            currentVersion = TARGET_SCHEMA_VERSION;
        }

        localStorage.setItem(SCHEMA_VERSION_KEY, String(currentVersion));
    }

    window.runStarPaperMigrations = runStorageMigrations;
})();
