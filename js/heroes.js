/**
 * HeroDatabase
 * 
 * Manages the Mobile Legends: Bang Bang hero database.
 * Supports loading, saving, querying, and updating heroes using localStorage.
 */
class HeroDatabase {
    static STORAGE_KEY = 'eclipse_heroes';
    
    // Complete list of MLBB heroes with their primary roles
    // 133 heroes total
    static DEFAULT_HEROES = [
        // Tanks (19)
        { name: 'Tigreal', role: 'Tank' },
        { name: 'Akai', role: 'Tank' },
        { name: 'Franco', role: 'Tank' },
        { name: 'Minotaur', role: 'Tank' },
        { name: 'Lolita', role: 'Tank' },
        { name: 'Johnson', role: 'Tank' },
        { name: 'Gatotkaca', role: 'Tank' },
        { name: 'Grock', role: 'Tank' },
        { name: 'Hylos', role: 'Tank' },
        { name: 'Uranus', role: 'Tank' },
        { name: 'Belerick', role: 'Tank' },
        { name: 'Khufra', role: 'Tank' },
        { name: 'Baxia', role: 'Tank' },
        { name: 'Atlas', role: 'Tank' },
        { name: 'Barats', role: 'Tank' },
        { name: 'Edith', role: 'Tank' },
        { name: 'Fredrinn', role: 'Tank' },
        { name: 'Chip', role: 'Tank' },
        { name: 'Gloo', role: 'Tank' },

        // Fighters (38)
        { name: 'Balmond', role: 'Fighter' },
        { name: 'Alucard', role: 'Fighter' },
        { name: 'Zilong', role: 'Fighter' },
        { name: 'Hilda', role: 'Fighter' },
        { name: 'Lapu-Lapu', role: 'Fighter' },
        { name: 'Roger', role: 'Fighter' },
        { name: 'Alpha', role: 'Fighter' },
        { name: 'Ruby', role: 'Fighter' },
        { name: 'Sun', role: 'Fighter' },
        { name: 'Chou', role: 'Fighter' },
        { name: 'Badang', role: 'Fighter' },
        { name: 'Guinevere', role: 'Fighter' },
        { name: 'X.Borg', role: 'Fighter' },
        { name: 'Dyrroth', role: 'Fighter' },
        { name: 'Masha', role: 'Fighter' },
        { name: 'Silvanna', role: 'Fighter' },
        { name: 'Yu Zhong', role: 'Fighter' },
        { name: 'Khaleed', role: 'Fighter' },
        { name: 'Paquito', role: 'Fighter' },
        { name: 'Phoveus', role: 'Fighter' },
        { name: 'Aulus', role: 'Fighter' },
        { name: 'Martis', role: 'Fighter' },
        { name: 'Terizla', role: 'Fighter' },
        { name: 'Thamuz', role: 'Fighter' },
        { name: 'Jawhead', role: 'Fighter' },
        { name: 'Leomord', role: 'Fighter' },
        { name: 'Aldous', role: 'Fighter' },
        { name: 'Minsitthar', role: 'Fighter' },
        { name: 'Arlott', role: 'Fighter' },
        { name: 'Cici', role: 'Fighter' },
        { name: 'Suyou', role: 'Fighter' },
        { name: 'Sora', role: 'Fighter' },
        { name: 'Lukas', role: 'Fighter' },
        { name: 'Exor', role: 'Fighter' },
        { name: 'Yin', role: 'Fighter' },
        { name: 'Argus', role: 'Fighter' },
        { name: 'Bane', role: 'Fighter' },
        { name: 'Freya', role: 'Fighter' },

        // Assassins (14)
        { name: 'Saber', role: 'Assassin' },
        { name: 'Fanny', role: 'Assassin' },
        { name: 'Natalia', role: 'Assassin' },
        { name: 'Hayabusa', role: 'Assassin' },
        { name: 'Karina', role: 'Assassin' },
        { name: 'Helcurt', role: 'Assassin' },
        { name: 'Gusion', role: 'Assassin' },
        { name: 'Hanzo', role: 'Assassin' },
        { name: 'Ling', role: 'Assassin' },
        { name: 'Lancelot', role: 'Assassin' },
        { name: 'Benedetta', role: 'Assassin' },
        { name: 'Aamon', role: 'Assassin' },
        { name: 'Joy', role: 'Assassin' },
        { name: 'Nolan', role: 'Assassin' },

        // Mages (29)
        { name: 'Alice', role: 'Mage' },
        { name: 'Nana', role: 'Mage' },
        { name: 'Eudora', role: 'Mage' },
        { name: 'Vexana', role: 'Mage' },
        { name: 'Aurora', role: 'Mage' },
        { name: 'Pharsa', role: 'Mage' },
        { name: 'Kagura', role: 'Mage' },
        { name: 'Cyclops', role: 'Mage' },
        { name: 'Vale', role: 'Mage' },
        { name: 'Valir', role: 'Mage' },
        { name: 'Lunox', role: 'Mage' },
        { name: 'Harith', role: 'Mage' },
        { name: 'Kadita', role: 'Mage' },
        { name: 'Zhask', role: 'Mage' },
        { name: 'Chang\'e', role: 'Mage' },
        { name: 'Esmeralda', role: 'Mage' },
        { name: 'Lylia', role: 'Mage' },
        { name: 'Cecilion', role: 'Mage' },
        { name: 'Luo Yi', role: 'Mage' },
        { name: 'Yve', role: 'Mage' },
        { name: 'Valentina', role: 'Mage' },
        { name: 'Xavier', role: 'Mage' },
        { name: 'Novaria', role: 'Mage' },
        { name: 'Julian', role: 'Mage' },
        { name: 'Odette', role: 'Mage' },
        { name: 'Harley', role: 'Mage' },
        { name: 'Mulan', role: 'Mage' },
        { name: 'Zetian', role: 'Mage' },
        { name: 'Zhuxin', role: 'Mage' },
        { name: 'Gord', role: 'Mage' },

        // Marksmen (21)
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
        { name: 'Brody', role: 'Marksman' },
        { name: 'Beatrix', role: 'Marksman' },
        { name: 'Melissa', role: 'Marksman' },
        { name: 'Natan', role: 'Marksman' },
        { name: 'Ixia', role: 'Marksman' },
        { name: 'Popol and Kupa', role: 'Marksman' },
        { name: 'Yi Sun-shin', role: 'Marksman' },
        { name: 'Obsidia', role: 'Marksman' },

        // Supports (12)
        { name: 'Rafaela', role: 'Support' },
        { name: 'Estes', role: 'Support' },
        { name: 'Angela', role: 'Support' },
        { name: 'Diggie', role: 'Support' },
        { name: 'Faramis', role: 'Support' },
        { name: 'Mathilda', role: 'Support' },
        { name: 'Floryn', role: 'Support' },
        { name: 'Carmilla', role: 'Support' },
        { name: 'Kaja', role: 'Support' },
        { name: 'Selena', role: 'Support' },
        { name: 'Lorna', role: 'Support' },
        { name: 'Kalea', role: 'Support' }
    ];

    /**
     * Initialize the HeroDatabase
     */
    constructor() {
        this.heroes = this.load();
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
                const cleaned = parsed.filter(h => h.name.toLowerCase() !== 'azuma');
                if (cleaned.length !== parsed.length) {
                    localStorage.setItem(HeroDatabase.STORAGE_KEY, JSON.stringify(cleaned));
                }
                return cleaned;
            }
        } catch (error) {
            console.error('Failed to load hero data from localStorage:', error);
        }
        
        // If not found or error, return a copy of the default heroes
        return [...HeroDatabase.DEFAULT_HEROES];
    }

    /**
     * Save current heroes array to local storage
     */
    save() {
        try {
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
        );
    }

    /**
     * Add a new hero to the database
     * @param {string} name - Hero name
     * @param {string} role - Hero primary role
     * @returns {boolean} True if successful, false if hero already exists
     */
    addHero(name, role) {
        if (!name || !role) return false;
        
        const nameTrimmed = name.trim();
        if (this.exists(nameTrimmed)) {
            return false; // Hero already exists
        }

        const newHero = {
            name: nameTrimmed,
            role: role.trim()
        };
        
        this.heroes.push(newHero);
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
        if (!name) return false;
        const lowerName = name.toLowerCase().trim();
        return this.heroes.some(hero => hero.name.toLowerCase() === lowerName);
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
