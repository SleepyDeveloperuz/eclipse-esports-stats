/**
 * HeroDatabase
 * 
 * Manages the Mobile Legends: Bang Bang hero database.
 * Supports loading, saving, querying, and updating heroes using localStorage.
 */
class HeroDatabase {
    static STORAGE_KEY = 'eclipse_heroes';
    static REMOVED_KEY = 'eclipse_removed_heroes';
    static INVALID_HERO_NAMES = new Set(['azuma', 'exor', 'mulan']);
    
    // Complete list of MLBB heroes with their primary roles
    // Curated default roster; persisted data is merged and sanitized on load.
    static DEFAULT_HEROES = [
        // Tanks (16)
        { name: 'Tigreal', role: 'Tank' },
        { name: 'Akai', role: 'Tank' },
        { name: 'Franco', role: 'Tank' },
        { name: 'Minotaur', role: 'Tank' },
        { name: 'Lolita', role: 'Tank' },
        { name: 'Grock', role: 'Tank' },
        { name: 'Hylos', role: 'Tank' },
        { name: 'Uranus', role: 'Tank' },
        { name: 'Belerick', role: 'Tank' },
        { name: 'Khufra', role: 'Tank' },
        { name: 'Baxia', role: 'Tank' },
        { name: 'Gloo', role: 'Tank' },
        { name: 'Atlas', role: 'Tank' },
        { name: 'Chip', role: 'Tank' },
        { name: 'Johnson', role: 'Tank' },
        { name: 'Edith', role: 'Tank' },

        // Fighters (43)
        { name: 'Balmond', role: 'Fighter' },
        { name: 'Alucard', role: 'Fighter' },
        { name: 'Bane', role: 'Fighter' },
        { name: 'Zilong', role: 'Fighter' },
        { name: 'Freya', role: 'Fighter' },
        { name: 'Alpha', role: 'Fighter' },
        { name: 'Ruby', role: 'Fighter' },
        { name: 'Roger', role: 'Fighter' },
        { name: 'Gatotkaca', role: 'Fighter' },
        { name: 'Jawhead', role: 'Fighter' },
        { name: 'Martis', role: 'Fighter' },
        { name: 'Aldous', role: 'Fighter' },
        { name: 'Minsitthar', role: 'Fighter' },
        { name: 'Badang', role: 'Fighter' },
        { name: 'Guinevere', role: 'Fighter' },
        { name: 'X.Borg', role: 'Fighter' },
        { name: 'Dyrroth', role: 'Fighter' },
        { name: 'Khaleed', role: 'Fighter' },
        { name: 'Yu Zhong', role: 'Fighter' },
        { name: 'Paquito', role: 'Fighter' },
        { name: 'Phoveus', role: 'Fighter' },
        { name: 'Aulus', role: 'Fighter' },
        { name: 'Arlott', role: 'Fighter' },
        { name: 'Cici', role: 'Fighter' },
        { name: 'Suyou', role: 'Fighter' },
        { name: 'Sora', role: 'Fighter' },
        { name: 'Lukas', role: 'Fighter' },
        { name: 'Yin', role: 'Fighter' },
        { name: 'Argus', role: 'Fighter' },
        { name: 'Sun', role: 'Fighter' },
        { name: 'Hilda', role: 'Fighter' },
        { name: 'Lapu-Lapu', role: 'Fighter' },
        { name: 'Leomord', role: 'Fighter' },
        { name: 'Thamuz', role: 'Fighter' },
        { name: 'Terizla', role: 'Fighter' },
        { name: 'Silvanna', role: 'Fighter' },
        { name: 'Chou', role: 'Fighter' },
        { name: 'Barats', role: 'Fighter' },
        { name: 'Fredrinn', role: 'Fighter' },
        { name: 'Joy', role: 'Fighter' },
        { name: 'Kaja', role: 'Fighter' },
        { name: 'Marcel', role: 'Fighter' },

        // Assassins (17)
        { name: 'Saber', role: 'Assassin' },
        { name: 'Fanny', role: 'Assassin' },
        { name: 'Natalia', role: 'Assassin' },
        { name: 'Hayabusa', role: 'Assassin' },
        { name: 'Lancelot', role: 'Assassin' },
        { name: 'Helcurt', role: 'Assassin' },
        { name: 'Gusion', role: 'Assassin' },
        { name: 'Selena', role: 'Assassin' },
        { name: 'Kadita', role: 'Assassin' },
        { name: 'Benedetta', role: 'Assassin' },
        { name: 'Aamon', role: 'Assassin' },
        { name: 'Ling', role: 'Assassin' },
        { name: 'Hanzo', role: 'Assassin' },
        { name: 'Nolan', role: 'Assassin' },
        { name: 'Karina', role: 'Assassin' },
        { name: 'Yi Sun-shin', role: 'Assassin' },
        { name: 'Hirara', role: 'Assassin' },

        // Mages (28)
        { name: 'Eudora', role: 'Mage' },
        { name: 'Alice', role: 'Mage' },
        { name: 'Nana', role: 'Mage' },
        { name: 'Harley', role: 'Mage' },
        { name: 'Odette', role: 'Mage' },
        { name: 'Zhask', role: 'Mage' },
        { name: 'Valir', role: 'Mage' },
        { name: 'Lunox', role: 'Mage' },
        { name: 'Esmeralda', role: 'Mage' },
        { name: 'Lylia', role: 'Mage' },
        { name: 'Cecilion', role: 'Mage' },
        { name: 'Luo Yi', role: 'Mage' },
        { name: 'Yve', role: 'Mage' },
        { name: 'Valentina', role: 'Mage' },
        { name: 'Xavier', role: 'Mage' },
        { name: 'Novaria', role: 'Mage' },
        { name: 'Julian', role: 'Mage' },
        { name: 'Pharsa', role: 'Mage' },
        { name: 'Kagura', role: 'Mage' },
        { name: 'Cyclops', role: 'Mage' },
        { name: 'Aurora', role: 'Mage' },
        { name: 'Vexana', role: 'Mage' },
        { name: "Chang'e", role: 'Mage' },
        { name: 'Vale', role: 'Mage' },
        { name: 'Gord', role: 'Mage' },
        { name: 'Zhuxin', role: 'Mage' },
        { name: 'Zetian', role: 'Mage' },

        // Marksmen (19)
        { name: 'Layla', role: 'Marksman' },
        { name: 'Miya', role: 'Marksman' },
        { name: 'Bruno', role: 'Marksman' },
        { name: 'Clint', role: 'Marksman' },
        { name: 'Moskov', role: 'Marksman' },
        { name: 'Karrie', role: 'Marksman' },
        { name: 'Irithel', role: 'Marksman' },
        { name: 'Lesley', role: 'Marksman' },
        { name: 'Hanabi', role: 'Marksman' },
        { name: 'Claude', role: 'Marksman' },
        { name: 'Kimmy', role: 'Marksman' },
        { name: 'Granger', role: 'Marksman' },
        { name: 'Wanwan', role: 'Marksman' },
        { name: 'Popol and Kupa', role: 'Marksman' },
        { name: 'Brody', role: 'Marksman' },
        { name: 'Beatrix', role: 'Marksman' },
        { name: 'Melissa', role: 'Marksman' },
        { name: 'Natan', role: 'Marksman' },
        { name: 'Ixia', role: 'Marksman' },

        // Supports (8)
        { name: 'Rafaela', role: 'Support' },
        { name: 'Estes', role: 'Support' },
        { name: 'Angela', role: 'Support' },
        { name: 'Faramis', role: 'Support' },
        { name: 'Floryn', role: 'Support' },
        { name: 'Diggie', role: 'Support' },
        { name: 'Mathilda', role: 'Support' },
        { name: 'Carmilla', role: 'Support' }
    ];

    /**
     * Initialize the HeroDatabase
     */
    constructor() {
        this.heroes = this.load();
    }

    static cleanText(value, maxLength = 80) {
        return String(value || '')
            .replace(/[\u0000-\u001f\u007f<>\"]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, maxLength);
    }

    static normalizeKey(value) {
        return HeroDatabase.cleanText(value, 100)
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLocaleLowerCase('en-US')
            .replace(/[^a-z0-9]+/g, '');
    }

    static cleanList(values, maxItems = 12, maxLength = 80) {
        const seen = new Set();
        return (Array.isArray(values) ? values : []).reduce((items, value) => {
            const cleaned = HeroDatabase.cleanText(value, maxLength);
            const key = HeroDatabase.normalizeKey(cleaned);
            if (!cleaned || !key || seen.has(key)) return items;
            seen.add(key);
            items.push(cleaned);
            return items;
        }, []).slice(0, maxItems);
    }

    static sanitizeHeroes(heroes, removedNames = new Set()) {
        const seen = new Set();
        return (Array.isArray(heroes) ? heroes : []).reduce((cleaned, hero) => {
            const name = HeroDatabase.cleanText(hero?.name, 80);
            const roles = HeroDatabase.cleanList(hero?.roles, 5, 40);
            const role = HeroDatabase.cleanText(hero?.role || roles[0] || 'Unknown', 40);
            const key = HeroDatabase.normalizeKey(name);
            if (!name || !role || seen.has(key)
                || HeroDatabase.INVALID_HERO_NAMES.has(name.toLowerCase())
                || removedNames.has(name.toLowerCase())) return cleaned;
            seen.add(key);
            const id = Number(hero?.id);
            const aliases = HeroDatabase.cleanList(hero?.aliases, 12, 80);
            const lanes = HeroDatabase.cleanList(hero?.lanes, 8, 40);
            const imageCandidate = HeroDatabase.cleanText(hero?.image || hero?.images?.portrait, 500);
            cleaned.push({
                ...(Number.isInteger(id) && id > 0 && id <= 10000 ? { id } : {}),
                name,
                role,
                ...(roles.length ? { roles } : {}),
                ...(aliases.length ? { aliases } : {}),
                ...(lanes.length ? { lanes } : {}),
                ...(imageCandidate.startsWith('https://') ? { image: imageCandidate } : {}),
                canonical: Number.isInteger(id) && id > 0 && id <= 10000
            });
            return cleaned;
        }, []);
    }

    /**
     * Load heroes from local storage or fallback to defaults
     * @returns {Array} Array of hero objects
     */
    load() {
        try {
            const savedData = localStorage.getItem(HeroDatabase.STORAGE_KEY);
            if (savedData) {
                const parsed = JSON.parse(savedData);
                const removedNames = this.getRemovedNames();
                const cleaned = HeroDatabase.sanitizeHeroes(parsed, removedNames);
                
                // A saved database is authoritative. Defaults are not re-merged here,
                // otherwise an admin-deleted hero returns on every reload.
                if (!Array.isArray(parsed) || cleaned.length !== parsed.length) {
                    localStorage.setItem(HeroDatabase.STORAGE_KEY, JSON.stringify(cleaned));
                }
                return cleaned;
            }
        } catch (error) {
            console.error('Failed to load hero data from localStorage:', error);
        }
        
        // If not found or error, return a copy of the default heroes
        return HeroDatabase.sanitizeHeroes(HeroDatabase.DEFAULT_HEROES, this.getRemovedNames());
    }

    getRemovedNames() {
        try {
            const parsed = JSON.parse(localStorage.getItem(HeroDatabase.REMOVED_KEY) || '[]');
            return new Set(Array.isArray(parsed) ? parsed.map(name => String(name).toLowerCase()) : []);
        } catch (_) {
            return new Set();
        }
    }

    saveRemovedNames(names) {
        localStorage.setItem(HeroDatabase.REMOVED_KEY, JSON.stringify(Array.from(names)));
    }

    /**
     * Save current heroes array to local storage
     */
    save() {
        try {
            this.heroes = HeroDatabase.sanitizeHeroes(this.heroes, this.getRemovedNames());
            localStorage.setItem(HeroDatabase.STORAGE_KEY, JSON.stringify(this.heroes));
            return true;
        } catch (error) {
            console.error('Failed to save hero data to localStorage:', error);
            return false;
        }
    }

    /**
     * Get all heroes sorted alphabetically by name
     * @returns {Array} Sorted array of hero objects
     */
    getAll() {
        return [...this.heroes].sort((a, b) => a.name.localeCompare(b.name));
    }

    /**
     * Filter heroes by their primary role
     * @param {string} role - The role to filter by
     * @returns {Array} Array of matching hero objects
     */
    getByRole(role) {
        if (!role) return this.getAll();
        const lowerRole = role.toLowerCase();
        return this.getAll().filter(hero => hero.role.toLowerCase() === lowerRole);
    }

    /**
     * Fuzzy search heroes by name
     * @param {string} query - The search string
     * @returns {Array} Array of matching hero objects
     */
    search(query) {
        if (!query || query.trim() === '') return this.getAll();
        
        const lowerQuery = query.toLowerCase().trim();
        return this.getAll().filter(hero =>
            hero.name.toLowerCase().includes(lowerQuery)
            || (hero.aliases || []).some(alias => alias.toLowerCase().includes(lowerQuery))
        );
    }

    findById(id) {
        const numericId = Number(id);
        return Number.isInteger(numericId) ? this.heroes.find(hero => hero.id === numericId) || null : null;
    }

    findByName(name) {
        const key = HeroDatabase.normalizeKey(name);
        if (!key) return null;
        return this.heroes.find(hero => HeroDatabase.normalizeKey(hero.name) === key
            || (hero.aliases || []).some(alias => HeroDatabase.normalizeKey(alias) === key)) || null;
    }

    resolve(value) {
        if (value && typeof value === 'object') {
            return this.findById(value.heroId ?? value.id)
                || this.findByName(value.heroNameSnapshot || value.heroUsed || value.name);
        }
        return this.findById(value) || this.findByName(value);
    }

    hydrateCanonical(catalog = []) {
        const currentById = new Map(this.heroes.filter(hero => hero.id).map(hero => [hero.id, hero]));
        const currentByKey = new Map(this.heroes.map(hero => [HeroDatabase.normalizeKey(hero.name), hero]));
        const incoming = (Array.isArray(catalog) ? catalog : []).map(hero => {
            const id = Number(hero?.id);
            const key = HeroDatabase.normalizeKey(hero?.name);
            const existing = (Number.isInteger(id) && currentById.get(id)) || currentByKey.get(key) || {};
            return {
                ...existing,
                ...hero,
                role: hero?.role || hero?.roles?.[0] || existing.role || 'Unknown',
                canonical: Number.isInteger(id) && id > 0
            };
        });
        const canonicalNames = new Set(incoming.map(hero => String(hero?.name || '').toLowerCase()).filter(Boolean));
        const removedNames = this.getRemovedNames();
        canonicalNames.forEach(name => removedNames.delete(name));
        this.saveRemovedNames(removedNames);
        // Once the live provider succeeds it becomes authoritative. Keeping
        // unmatched hand-written rows here would reintroduce fictional or
        // retired heroes beside the canonical MLBB catalog.
        this.heroes = HeroDatabase.sanitizeHeroes(incoming, removedNames);
        return this.save();
    }

    /**
     * Add a new hero to the database
     * @param {string} name - Hero name
     * @param {string} role - Hero primary role
     * @returns {boolean} True if successful, false if hero already exists
     */
    addHero(name, role) {
        if (!name || !role) return false;
        
        const nameTrimmed = name.replace(/[\u0000-\u001f\u007f<>\"]/g, '').trim().slice(0, 80);
        const roleTrimmed = role.replace(/[\u0000-\u001f\u007f<>\"]/g, '').trim().slice(0, 40);
        if (!nameTrimmed || !roleTrimmed || HeroDatabase.INVALID_HERO_NAMES.has(nameTrimmed.toLowerCase())) return false;
        if (this.exists(nameTrimmed)) {
            return false; // Hero already exists
        }

        const newHero = {
            name: nameTrimmed,
            role: roleTrimmed
        };
        
        this.heroes.push(newHero);
        const removedNames = this.getRemovedNames();
        removedNames.delete(nameTrimmed.toLowerCase());
        this.saveRemovedNames(removedNames);
        this.save();
        return true;
    }

    /**
     * Remove a hero by name
     * @param {string} name - The exact name of the hero to remove
     * @returns {boolean} True if removed, false if not found
     */
    removeHero(name) {
        if (!name) return false;
        
        const initialLength = this.heroes.length;
        this.heroes = this.heroes.filter(
            hero => hero.name.toLowerCase() !== name.toLowerCase().trim()
        );
        
        if (this.heroes.length !== initialLength) {
            const removedNames = this.getRemovedNames();
            removedNames.add(name.toLowerCase().trim());
            this.saveRemovedNames(removedNames);
            this.save();
            return true;
        }
        
        return false;
    }

    /**
     * Check if a hero exists by name
     * @param {string} name - The name to check
     * @returns {boolean} True if the hero exists
     */
    exists(name) {
        return Boolean(this.findByName(name));
    }

    /**
     * Get a list of all unique roles in the database
     * @returns {Array} Array of role strings
     */
    getRoles() {
        const roles = new Set(this.heroes.map(hero => hero.role));
        return Array.from(roles).sort();
    }
}

// Make globally available
window.HeroDatabase = HeroDatabase;
