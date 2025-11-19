import { Pool } from 'pg';
import { logger } from '../utils/logger';

/**
 * Cache Service
 * Manages PostgreSQL caching for scraped LinkedIn profiles
 */
export class CacheService {
  private pool: Pool;
  private initPromise: Promise<void>;

  constructor() {
    this.pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_NAME || 'linkedin',
      max: 20, // max connections
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
    
    this.initPromise = this.initDatabase();
  }

  /**
   * Initializes the database schema
   * Creates the linkedin_profiles and linkedin_conversations tables and indexes if they don't exist
   * @private
   */
  private async initDatabase(): Promise<void> {
    const client = await this.pool.connect();
    try {
      // Create profiles table
      await client.query(`
        CREATE TABLE IF NOT EXISTS linkedin_profiles (
          id SERIAL PRIMARY KEY,
          profile_url VARCHAR(255) UNIQUE NOT NULL,
          scraped_data JSONB NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      await client.query('CREATE INDEX IF NOT EXISTS idx_profile_url ON linkedin_profiles(profile_url)');
      
      // Create conversations table with new schema
      await client.query(`
        CREATE TABLE IF NOT EXISTS linkedin_conversations (
          id SERIAL PRIMARY KEY,
          profile_url VARCHAR(255),
          conversation_url VARCHAR(512),
          conversation_data JSONB NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          CONSTRAINT unique_identifiers UNIQUE (profile_url, conversation_url)
        )
      `);

      // Auto-migration for existing tables
      try {
        await client.query('ALTER TABLE linkedin_conversations ADD COLUMN IF NOT EXISTS conversation_url VARCHAR(512)');
        await client.query('ALTER TABLE linkedin_conversations ALTER COLUMN profile_url DROP NOT NULL');
      } catch (e) {
        // Ignore errors if columns already exist or other migration issues
        logger.debug('Migration steps skipped or failed', e);
      }

      // Ensure unique indexes for ON CONFLICT support
      // We drop existing non-unique indexes if they exist with the same name to upgrade them
      try {
        await client.query('DROP INDEX IF EXISTS idx_conversation_url');
        await client.query('DROP INDEX IF EXISTS idx_conversation_profile_url');
      } catch (e) {
        // Ignore drop errors
      }

      await client.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_conversation_profile_url ON linkedin_conversations(profile_url)');
      await client.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_conversation_url ON linkedin_conversations(conversation_url)');
      
      logger.info('✅ Database initialized successfully');
    } catch (error) {
      logger.error('❌ Database initialization error:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Retrieves a cached profile from the database
   * @param profileUrl - LinkedIn profile URL
   * @returns Cached profile data or null if not found
   */
  async getProfile(profileUrl: string): Promise<any | null> {
    await this.initPromise;
    
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'SELECT scraped_data FROM linkedin_profiles WHERE profile_url = $1',
        [profileUrl]
      );
      return result.rows[0]?.scraped_data || null;
    } catch (error) {
      logger.error('Cache get error:', error);
      return null;
    } finally {
      client.release();
    }
  }

  /**
   * Stores a scraped profile in the cache
   * @param profileUrl - LinkedIn profile URL
   * @param data - Profile data to cache
   */
  async cacheProfile(profileUrl: string, data: any) {
    await this.initPromise;
    
    const client = await this.pool.connect();
    try {
      // Ensure data is a proper JavaScript object, not a stringified JSON
      const jsonData = typeof data === 'string' ? JSON.parse(data) : data;
      
      await client.query(
        `INSERT INTO linkedin_profiles (profile_url, scraped_data)
         VALUES ($1, $2::jsonb)
         ON CONFLICT (profile_url) DO UPDATE
         SET scraped_data = $2::jsonb, updated_at = NOW()`,
        [profileUrl, JSON.stringify(jsonData)]
      );
      logger.info(`✅ Cached profile: ${profileUrl}`);
    } catch (error) {
      logger.error('Cache save error:', error);
    } finally {
      client.release();
    }
  }

  /**
   * Retrieves a cached conversation by profile URL or conversation URL
   */
  async getConversation(url: string, by: 'profile' | 'conversation' = 'profile'): Promise<any | null> {
    await this.initPromise;
    
    const client = await this.pool.connect();
    try {
      const column = by === 'conversation' ? 'conversation_url' : 'profile_url';
      const result = await client.query(
        `SELECT conversation_data FROM linkedin_conversations WHERE ${column} = $1`,
        [url]
      );
      return result.rows[0]?.conversation_data || null;
    } catch (error) {
      logger.error('Conversation cache get error:', error);
      return null;
    } finally {
      client.release();
    }
  }

  /**
   * Stores a conversation in the cache using profile URL or conversation URL
   */
  async cacheConversation(url: string, data: any, by: 'profile' | 'conversation' = 'profile') {
    await this.initPromise;
    
    const client = await this.pool.connect();
    try {
      const jsonData = typeof data === 'string' ? JSON.parse(data) : data;
      const column = by === 'conversation' ? 'conversation_url' : 'profile_url';
      
      // Upsert logic based on the identifier used
      // Note: We use explicit ON CONFLICT handling for each case since we might have unique constraints
      // For simplicity assuming the uniqueness is on the column we're querying by
      // or dealing with the generic unique_identifiers constraint might be tricky if we don't have both.
      // But the query below assumes we are updating based on the key provided.
      
      // If by='conversation', we use conversation_url. If by='profile', we use profile_url.
      // The conflict target needs to match a unique constraint.
      // If we added a unique index on conversation_url, we can use it.
      // If we added a unique index on profile_url, we can use it.
      
      // However, the create table has `CONSTRAINT unique_identifiers UNIQUE (profile_url, conversation_url)`
      // This composite key is tricky for partial upserts unless we have both.
      // BUT, we added `CREATE INDEX ... idx_conversation_url` (not unique in my code above? wait)
      // User's SQL says: CREATE UNIQUE INDEX IF NOT EXISTS idx_conversation_url ON linkedin_conversations(conversation_url);
      // I should ensure I create UNIQUE indexes if I want to rely on them for ON CONFLICT.
      
      // Let's assume standard behavior:
      const conflictTarget = by === 'conversation' ? 'conversation_url' : 'profile_url';
      
      await client.query(
        `INSERT INTO linkedin_conversations (${column}, conversation_data)
         VALUES ($1, $2::jsonb)
         ON CONFLICT (${conflictTarget}) DO UPDATE
         SET conversation_data = $2::jsonb, updated_at = NOW()`,
        [url, JSON.stringify(jsonData)]
      );
      logger.info(`✅ Cached conversation by ${by}: ${url}`);
    } catch (error) {
      logger.error('Conversation cache save error:', error);
    } finally {
      client.release();
    }
  }
}
