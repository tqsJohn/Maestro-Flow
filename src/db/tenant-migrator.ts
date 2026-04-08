import { readFile, readdir } from 'fs/promises';
import { join } from 'path';
import type { Pool } from 'pg';

export class TenantMigrator {
  constructor(
    private templateDir: string,
    private pool: Pool,
  ) {}

  async runMigrationForTenant(tenantSlug: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      // Validate slug to prevent SQL injection
      if (!/^[a-z0-9_]+$/.test(tenantSlug)) {
        throw new Error(`Invalid tenant slug: ${tenantSlug}`);
      }

      // Create schema if not exists
      await client.query(`CREATE SCHEMA IF NOT EXISTS ${tenantSlug}`);

      // Read and execute template SQL files
      const files = await this.getSqlFiles();
      for (const file of files.sort()) {
        const sqlPath = join(this.templateDir, file);
        const sqlContent = await readFile(sqlPath, 'utf-8');
        const migratedSql = sqlContent.replace(/__tenant__/g, tenantSlug);

        await client.query(`SET search_path TO ${tenantSlug}, public`);
        await client.query(migratedSql);
      }

      // Reset search_path
      await client.query('SET search_path TO public');

      // Record migration in public schema
      await client.query(
        `INSERT INTO tenant_migrations (tenant_slug, version, applied_at)
         VALUES ($1, 1, NOW())
         ON CONFLICT (tenant_slug, version) DO NOTHING`,
        [tenantSlug],
      );
    } finally {
      client.release();
    }
  }

  async runMigrationForAllTenants(slugs: string[], parallel = false): Promise<void> {
    if (parallel) {
      await Promise.all(slugs.map((slug) => this.runMigrationForTenant(slug)));
    } else {
      for (const slug of slugs) {
        await this.runMigrationForTenant(slug);
      }
    }
  }

  async rollbackMigration(tenantSlug: string, version: number): Promise<void> {
    if (!/^[a-z0-9_]+$/.test(tenantSlug)) {
      throw new Error(`Invalid tenant slug: ${tenantSlug}`);
    }

    const client = await this.pool.connect();
    try {
      // Drop the schema (cascade to remove all objects)
      await client.query(`DROP SCHEMA IF EXISTS ${tenantSlug} CASCADE`);

      // Remove migration record
      await client.query(
        `DELETE FROM tenant_migrations WHERE tenant_slug = $1 AND version = $2`,
        [tenantSlug, version],
      );
    } finally {
      client.release();
    }
  }

  private async getSqlFiles(): Promise<string[]> {
    try {
      const files = await readdir(this.templateDir);
      return files.filter((f) => f.endsWith('.sql'));
    } catch {
      return [];
    }
  }
}
