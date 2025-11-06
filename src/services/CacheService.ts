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
   * Creates the linkedin_profiles table and indexes if they don't exist
   * @private
   */
  private async initDatabase(): Promise<void> {
    const client = await this.pool.connect();
    try {
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
      await client.query(
        `INSERT INTO linkedin_profiles (profile_url, scraped_data)
         VALUES ($1, $2)
         ON CONFLICT (profile_url) DO UPDATE
         SET scraped_data = $2, updated_at = NOW()`,
        [profileUrl, data]
      );
      logger.info(`✅ Cached profile: ${profileUrl}`);
    } catch (error) {
      logger.error('Cache save error:', error);
    } finally {
      client.release();
    }
  }
}
