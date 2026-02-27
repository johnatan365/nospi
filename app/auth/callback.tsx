
import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { nospiColors } from '@/constants/Colors';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase';

export default function AuthCallbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [status, setStatus] = useState('Procesando autenticación...');

  useEffect(() => {
    console.log('AuthCallbackScreen: OAuth callback received');
    console.log('AuthCallbackScreen: URL params:', params);
    
    const handleCallback = async () => {
      try {
        // Extract tokens from URL params
        const accessToken = params.access_token as string;
        const refreshToken = params.refresh_token as string;
        const type = params.type as string;

        console.log('AuthCallbackScreen: Token type:', type);
        console.log('AuthCallbackScreen: Has access token:', !!accessToken);
        console.log('AuthCallbackScreen: Has refresh token:', !!refreshToken);

        // If we have tokens in the URL, set the session manually
        if (accessToken && refreshToken) {
          console.log('AuthCallbackScreen: Setting session from URL tokens');
          
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (error) {
            console.error('AuthCallbackScreen: Error setting session:', error);
            setStatus('Error al establecer la sesión');
            setTimeout(() => {
              router.replace('/welcome');
            }, 2000);
            return;
          }

          if (data.session) {
            console.log('AuthCallbackScreen: Session set successfully, user:', data.session.user.id);
            console.log('AuthCallbackScreen: User metadata:', data.session.user.user_metadata);
            setStatus('Sesión establecida correctamente');

            // Extract Google user data
            const googleUser = data.session.user;
            const metadata = googleUser.user_metadata || {};
            
            // Google provides these fields in user_metadata
            const fullName = metadata.full_name || metadata.name || googleUser.email?.split('@')[0] || 'Usuario';
            const profilePhotoUrl = metadata.avatar_url || metadata.picture || null;
            const email = googleUser.email || '';

            console.log('AuthCallbackScreen: Extracted data - Name:', fullName, 'Email:', email, 'Photo:', profilePhotoUrl);

            // Check if user profile exists by ID first (primary check)
            const { data: existingProfileById, error: profileByIdError } = await supabase
              .from('users')
              .select('*')
              .eq('id', googleUser.id)
              .maybeSingle();

            if (profileByIdError && profileByIdError.code !== 'PGRST116') {
              console.error('AuthCallbackScreen: Error checking profile by ID:', profileByIdError);
            }

            // Also check if a profile exists with this email (to handle edge cases)
            const { data: existingProfileByEmail, error: profileByEmailError } = await supabase
              .from('users')
              .select('*')
              .eq('email', email)
              .maybeSingle();

            if (profileByEmailError && profileByEmailError.code !== 'PGRST116') {
              console.error('AuthCallbackScreen: Error checking profile by email:', profileByEmailError);
            }

            // If profile exists by ID, update it
            if (existingProfileById) {
              console.log('AuthCallbackScreen: Profile exists by ID, updating Google data');
              
              const updateData: any = {};
              
              // Only update name if it's empty or default
              if (!existingProfileById.name || existingProfileById.name === 'Usuario' || existingProfileById.name === '') {
                updateData.name = fullName;
              }
              
              // Always update photo from Google if available
              if (profilePhotoUrl) {
                updateData.profile_photo_url = profilePhotoUrl;
              }

              // Only update if there's something to update
              if (Object.keys(updateData).length > 0) {
                console.log('AuthCallbackScreen: Updating profile with:', updateData);
                
                const { error: updateError } = await supabase
                  .from('users')
                  .update(updateData)
                  .eq('id', googleUser.id);

                if (updateError) {
                  console.error('AuthCallbackScreen: Error updating profile:', updateError);
                } else {
                  console.log('AuthCallbackScreen: Profile updated successfully');
                }
              }
            } 
            // If profile exists by email but not by ID, this is a duplicate email situation
            else if (existingProfileByEmail) {
              console.log('AuthCallbackScreen: Profile exists with this email but different ID - updating existing profile');
              
              // Update the existing profile to use the new auth ID
              const updateData: any = {
                id: googleUser.id, // Update to new auth ID
              };
              
              // Only update name if it's empty or default
              if (!existingProfileByEmail.name || existingProfileByEmail.name === 'Usuario' || existingProfileByEmail.name === '') {
                updateData.name = fullName;
              }
              
              // Always update photo from Google if available
              if (profilePhotoUrl) {
                updateData.profile_photo_url = profilePhotoUrl;
              }

              console.log('AuthCallbackScreen: Updating existing profile with new auth ID:', updateData);
              
              const { error: updateError } = await supabase
                .from('users')
                .update(updateData)
                .eq('email', email);

              if (updateError) {
                console.error('AuthCallbackScreen: Error updating existing profile:', updateError);
                setStatus('Error al actualizar el perfil');
              } else {
                console.log('AuthCallbackScreen: Existing profile updated successfully');
              }
            }
            // No profile exists - user must register first
            else {
              console.log('AuthCallbackScreen: No profile found - user must register through the app first');
              
              // Sign out the user since they haven't registered
              await supabase.auth.signOut();
              
              setStatus('Debes registrarte primero en la aplicación antes de iniciar sesión con Google');
              
              setTimeout(() => {
                router.replace('/onboarding/register');
              }, 2500);
              return;
            }

            // Navigate to events screen
            console.log('AuthCallbackScreen: Navigating to events screen');
            setTimeout(() => {
              router.replace('/(tabs)/events');
            }, 500);
            return;
          }
        }

        // Fallback: Try to get session normally
        console.log('AuthCallbackScreen: No tokens in URL, checking for existing session');
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('AuthCallbackScreen: Error getting session:', error);
          setStatus('Error al obtener la sesión');
          setTimeout(() => {
            router.replace('/welcome');
          }, 2000);
          return;
        }

        if (session) {
          console.log('AuthCallbackScreen: Session found, user:', session.user.id);
          console.log('AuthCallbackScreen: User metadata:', session.user.user_metadata);
          setStatus('Sesión encontrada, redirigiendo...');
          
          // Extract Google user data
          const googleUser = session.user;
          const metadata = googleUser.user_metadata || {};
          
          const fullName = metadata.full_name || metadata.name || googleUser.email?.split('@')[0] || 'Usuario';
          const profilePhotoUrl = metadata.avatar_url || metadata.picture || null;
          const email = googleUser.email || '';

          console.log('AuthCallbackScreen: Extracted data - Name:', fullName, 'Email:', email, 'Photo:', profilePhotoUrl);

          // Check if user profile exists by ID first
          const { data: existingProfileById, error: profileByIdError } = await supabase
            .from('users')
            .select('*')
            .eq('id', googleUser.id)
            .maybeSingle();

          if (profileByIdError && profileByIdError.code !== 'PGRST116') {
            console.error('AuthCallbackScreen: Error checking profile by ID:', profileByIdError);
          }

          // Also check by email
          const { data: existingProfileByEmail, error: profileByEmailError } = await supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .maybeSingle();

          if (profileByEmailError && profileByEmailError.code !== 'PGRST116') {
            console.error('AuthCallbackScreen: Error checking profile by email:', profileByEmailError);
          }

          // If profile exists by ID, update it
          if (existingProfileById) {
            console.log('AuthCallbackScreen: Profile exists by ID, updating Google data');
            
            const updateData: any = {};
            
            // Only update name if it's empty or default
            if (!existingProfileById.name || existingProfileById.name === 'Usuario' || existingProfileById.name === '') {
              updateData.name = fullName;
            }
            
            // Always update photo from Google if available
            if (profilePhotoUrl) {
              updateData.profile_photo_url = profilePhotoUrl;
            }

            // Only update if there's something to update
            if (Object.keys(updateData).length > 0) {
              console.log('AuthCallbackScreen: Updating profile with:', updateData);
              
              const { error: updateError } = await supabase
                .from('users')
                .update(updateData)
                .eq('id', googleUser.id);

              if (updateError) {
                console.error('AuthCallbackScreen: Error updating profile:', updateError);
              } else {
                console.log('AuthCallbackScreen: Profile updated successfully');
              }
            }
          }
          // If profile exists by email but not by ID
          else if (existingProfileByEmail) {
            console.log('AuthCallbackScreen: Profile exists with this email but different ID - updating existing profile');
            
            const updateData: any = {
              id: googleUser.id,
            };
            
            if (!existingProfileByEmail.name || existingProfileByEmail.name === 'Usuario' || existingProfileByEmail.name === '') {
              updateData.name = fullName;
            }
            
            if (profilePhotoUrl) {
              updateData.profile_photo_url = profilePhotoUrl;
            }

            console.log('AuthCallbackScreen: Updating existing profile with new auth ID:', updateData);
            
            const { error: updateError } = await supabase
              .from('users')
              .update(updateData)
              .eq('email', email);

            if (updateError) {
              console.error('AuthCallbackScreen: Error updating existing profile:', updateError);
              setStatus('Error al actualizar el perfil');
            } else {
              console.log('AuthCallbackScreen: Existing profile updated successfully');
            }
          }
          // No profile exists - user must register first
          else {
            console.log('AuthCallbackScreen: No profile found - user must register through the app first');
            
            // Sign out the user since they haven't registered
            await supabase.auth.signOut();
            
            setStatus('Debes registrarte primero en la aplicación antes de iniciar sesión con Google');
            
            setTimeout(() => {
              router.replace('/onboarding/register');
            }, 2500);
            return;
          }

          // Navigate to events screen
          console.log('AuthCallbackScreen: Navigating to events screen');
          router.replace('/(tabs)/events');
        } else {
          console.log('AuthCallbackScreen: No session found after OAuth');
          setStatus('No se encontró sesión. Por favor intenta de nuevo.');
          setTimeout(() => {
            router.replace('/welcome');
          }, 2000);
        }
      } catch (error) {
        console.error('AuthCallbackScreen: Error processing callback:', error);
        setStatus('Error al procesar la autenticación');
        setTimeout(() => {
          router.replace('/welcome');
        }, 2000);
      }
    };

    handleCallback();
  }, [router, params]);

  return (
    <LinearGradient
      colors={['#FFFFFF', '#F3E8FF', '#E9D5FF', nospiColors.purpleLight, nospiColors.purpleMid]}
      style={styles.container}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
    >
      <View style={styles.content}>
        <ActivityIndicator size="large" color={nospiColors.purpleDark} />
        <Text style={styles.text}>{status}</Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  text: {
    marginTop: 16,
    fontSize: 16,
    color: nospiColors.purpleDark,
    textAlign: 'center',
  },
});
