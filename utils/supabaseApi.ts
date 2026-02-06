
import { supabase } from '@/lib/supabase';

export interface Note {
  id: string;
  title: string;
  content: string | null;
  created_at: string;
  updated_at: string;
  user_id: string;
}

/**
 * Fetch all notes for the current user
 */
export async function fetchNotes(): Promise<{ data: Note[] | null; error: string | null }> {
  try {
    console.log('Fetching notes from Supabase...');
    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching notes:', error.message);
      return { data: null, error: error.message };
    }

    console.log('Notes fetched successfully:', data?.length || 0, 'notes');
    return { data, error: null };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Failed to fetch notes:', errorMessage);
    return { data: null, error: errorMessage };
  }
}

/**
 * Create a new note
 */
export async function createNote(
  title: string,
  content: string
): Promise<{ data: Note | null; error: string | null }> {
  try {
    console.log('Creating note:', title);
    
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return { data: null, error: 'User not authenticated' };
    }

    const { data, error } = await supabase
      .from('notes')
      .insert([
        {
          title,
          content,
          user_id: user.id,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error('Error creating note:', error.message);
      return { data: null, error: error.message };
    }

    console.log('Note created successfully:', data.id);
    return { data, error: null };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Failed to create note:', errorMessage);
    return { data: null, error: errorMessage };
  }
}

/**
 * Update an existing note
 */
export async function updateNote(
  id: string,
  updates: { title?: string; content?: string }
): Promise<{ data: Note | null; error: string | null }> {
  try {
    console.log('Updating note:', id);
    const { data, error } = await supabase
      .from('notes')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating note:', error.message);
      return { data: null, error: error.message };
    }

    console.log('Note updated successfully:', data.id);
    return { data, error: null };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Failed to update note:', errorMessage);
    return { data: null, error: errorMessage };
  }
}

/**
 * Delete a note
 */
export async function deleteNote(id: string): Promise<{ error: string | null }> {
  try {
    console.log('Deleting note:', id);
    const { error } = await supabase.from('notes').delete().eq('id', id);

    if (error) {
      console.error('Error deleting note:', error.message);
      return { error: error.message };
    }

    console.log('Note deleted successfully:', id);
    return { error: null };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Failed to delete note:', errorMessage);
    return { error: errorMessage };
  }
}

/**
 * Test database connection by attempting to query the notes table
 */
export async function testDatabaseConnection(): Promise<{
  connected: boolean;
  error?: string;
  tableExists?: boolean;
}> {
  try {
    console.log('Testing database connection...');
    
    // Try to query the notes table
    const { data, error } = await supabase
      .from('notes')
      .select('id')
      .limit(1);

    if (error) {
      console.error('Database connection test failed:', error.message);
      return { 
        connected: false, 
        error: error.message,
        tableExists: false 
      };
    }

    console.log('✅ Database connected successfully');
    return { 
      connected: true, 
      tableExists: true 
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Database connection test error:', errorMessage);
    return { 
      connected: false, 
      error: errorMessage,
      tableExists: false 
    };
  }
}
