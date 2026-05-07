/**
 * Reusable Supabase client mock.
 * Each method returns a chainable builder so tests can override
 * the final resolved value with .mockResolvedValueOnce / mockReturnValueOnce.
 *
 * Usage in tests:
 *   const { supabaseMock } = require('../__mocks__/supabaseMock');
 *   supabaseMock.single.mockResolvedValueOnce({ data: { id: '1' }, error: null });
 */

const single = jest.fn().mockResolvedValue({ data: null, error: null });
const select = jest.fn().mockReturnThis();
const insert = jest.fn().mockReturnThis();
const update = jest.fn().mockReturnThis();
const upsert = jest.fn().mockReturnThis();
const del = jest.fn().mockReturnThis();
const eq = jest.fn().mockReturnThis();
const neq = jest.fn().mockReturnThis();
const order = jest.fn().mockReturnThis();
const range = jest.fn().mockReturnThis();
const limit = jest.fn().mockReturnThis();
const from = jest.fn().mockReturnValue({
  select,
  insert,
  update,
  upsert,
  delete: del,
  eq,
  neq,
  order,
  range,
  limit,
  single,
});

const supabaseMock = {
  from,
  select,
  insert,
  update,
  upsert,
  delete: del,
  eq,
  neq,
  order,
  range,
  limit,
  single,
};

/**
 * Resets all mock state between tests.
 * Call this in beforeEach to avoid state leaking across tests.
 */
function resetSupabaseMock() {
  from.mockReturnValue({
    select,
    insert,
    update,
    upsert,
    delete: del,
    eq,
    neq,
    order,
    range,
    limit,
    single,
  });
  single.mockResolvedValue({ data: null, error: null });
}

module.exports = { supabaseMock, resetSupabaseMock };
