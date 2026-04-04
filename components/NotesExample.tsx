
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useTheme } from '@react-navigation/native';
import { useSupabase } from '@/contexts/SupabaseContext';
import { fetchNotes, createNote, deleteNote, Note } from '@/utils/supabaseApi';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  inputContainer: {
    marginBottom: 20,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    fontSize: 16,
  },
  button: {
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  noteCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  noteContent: {
    flex: 1,
    marginRight: 12,
  },
  noteTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  noteText: {
    fontSize: 14,
    opacity: 0.7,
  },
  deleteButton: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: '#ef4444',
  },
  deleteButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  emptyText: {
    textAlign: 'center',
    fontSize: 16,
    opacity: 0.5,
    marginTop: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  authWarning: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  authWarningText: {
    color: '#ef4444',
    fontSize: 14,
    textAlign: 'center',
  },
});

export default function NotesExample() {
  const { colors } = useTheme();
  const { user } = useSupabase();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  useEffect(() => {
    console.log('NotesExample: Component mounted');
    if (user) {
      loadNotes();
    } else {
      setLoading(false);
    }
  }, [user]);

  const loadNotes = async () => {
    console.log('NotesExample: Loading notes');
    setLoading(true);
    const result = await fetchNotes();
    
    if (result.error) {
      console.error('NotesExample: Error loading notes:', result.error);
      Alert.alert('Error', result.error);
    } else {
      console.log('NotesExample: Loaded notes:', result.data?.length || 0);
      setNotes(result.data || []);
    }
    
    setLoading(false);
  };

  const handleCreateNote = async () => {
    if (!title.trim()) {
      Alert.alert('Error', 'Please enter a title');
      return;
    }

    console.log('NotesExample: Creating note:', title);
    setCreating(true);
    const result = await createNote(title, content);
    
    if (result.error) {
      console.error('NotesExample: Error creating note:', result.error);
      Alert.alert('Error', result.error);
    } else {
      console.log('NotesExample: Note created successfully');
      setTitle('');
      setContent('');
      await loadNotes();
    }
    
    setCreating(false);
  };

  const handleDeleteNote = async (id: string) => {
    console.log('NotesExample: Deleting note:', id);
    const result = await deleteNote(id);
    
    if (result.error) {
      console.error('NotesExample: Error deleting note:', result.error);
      Alert.alert('Error', result.error);
    } else {
      console.log('NotesExample: Note deleted successfully');
      await loadNotes();
    }
  };

  const confirmDelete = (id: string, noteTitle: string) => {
    Alert.alert(
      'Delete Note',
      `Are you sure you want to delete "${noteTitle}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => handleDeleteNote(id) },
      ]
    );
  };

  if (!user) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.authWarning}>
          <Text style={styles.authWarningText}>
            Please authenticate to use this feature
          </Text>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const titleValue = title;
  const contentValue = content;
  const notesCount = notes.length;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.inputContainer}>
        <TextInput
          style={[styles.input, { borderColor: colors.border, color: colors.text }]}
          placeholder="Note title"
          placeholderTextColor={colors.text + '80'}
          value={titleValue}
          onChangeText={setTitle}
        />
        <TextInput
          style={[styles.input, { borderColor: colors.border, color: colors.text }]}
          placeholder="Note content (optional)"
          placeholderTextColor={colors.text + '80'}
          value={contentValue}
          onChangeText={setContent}
          multiline
          numberOfLines={3}
        />
        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.primary }]}
          onPress={handleCreateNote}
          disabled={creating}
        >
          {creating ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>
              Create Note
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {notesCount === 0 ? (
        <Text style={[styles.emptyText, { color: colors.text }]}>
          No notes yet. Create your first note!
        </Text>
      ) : (
        <FlatList
          data={notes}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const noteTitle = item.title;
            const noteContent = item.content;
            const noteDate = new Date(item.created_at).toLocaleDateString();
            
            return (
              <View style={[styles.noteCard, { backgroundColor: colors.card }]}>
                <View style={styles.noteContent}>
                  <Text style={[styles.noteTitle, { color: colors.text }]}>
                    {noteTitle}
                  </Text>
                  {noteContent && (
                    <Text style={[styles.noteText, { color: colors.text }]}>
                      {noteContent}
                    </Text>
                  )}
                  <Text style={[styles.noteText, { color: colors.text }]}>
                    {noteDate}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => confirmDelete(item.id, item.title)}
                >
                  <Text style={styles.deleteButtonText}>
                    Delete
                  </Text>
                </TouchableOpacity>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}
