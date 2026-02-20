
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Mock questions database (in production, this would be a real database table)
const QUESTIONS = {
  divertido: [
    '¿Cuál es tu comida favorita y por qué?',
    '¿Qué harías si ganaras la lotería?',
    '¿Cuál es tu película favorita de todos los tiempos?',
    '¿Qué superpoder te gustaría tener?',
    '¿Cuál es el lugar más interesante que has visitado?',
    '¿Qué te hace reír sin falta?',
    '¿Cuál es tu hobby favorito?',
    '¿Qué canción te pone de buen humor?',
  ],
  sensual: [
    '¿Qué es lo más romántico que has hecho por alguien?',
    '¿Cuál es tu idea de una cita perfecta?',
    '¿Qué cualidad te atrae más de una persona?',
    '¿Cuál ha sido tu mejor beso?',
    '¿Qué te hace sentir especial?',
    '¿Cuál es tu recuerdo más romántico?',
    '¿Qué gesto romántico te derrite?',
  ],
  atrevido: [
    '¿Cuál es tu fantasía más atrevida?',
    '¿Qué es lo más loco que has hecho por amor?',
    '¿Cuál es tu secreto mejor guardado?',
    '¿Qué es lo más arriesgado que has hecho?',
    '¿Con quién de esta mesa tendrías una cita?',
    '¿Cuál es tu mayor arrepentimiento?',
    '¿Qué es lo más vergonzoso que te ha pasado?',
  ],
};

Deno.serve(async (req: Request) => {
  // Log project ref at runtime for verification
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || 'unknown';
  console.log('🔍 Edge Function Runtime Info:');
  console.log('  Project Ref:', projectRef);
  console.log('  Supabase URL:', supabaseUrl);
  console.log('  Request Method:', req.method);
  console.log('  Request URL:', req.url);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Log authorization header presence
    const authHeader = req.headers.get('Authorization');
    const apikeyHeader = req.headers.get('apikey');
    console.log('🔐 Auth Headers:');
    console.log('  Authorization present:', !!authHeader);
    console.log('  Authorization prefix:', authHeader?.substring(0, 20) + '...');
    console.log('  apikey present:', !!apikeyHeader);

    // Get Supabase client
    const supabaseClient = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader! },
        },
      }
    );

    // Verify user is authenticated
    console.log('🔍 Verifying user authentication...');
    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser();

    if (authError) {
      console.error('❌ Auth error:', authError.message);
      return new Response(
        JSON.stringify({ error: 'Unauthorized', details: authError.message }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!user) {
      console.error('❌ No user found in token');
      return new Response(
        JSON.stringify({ error: 'Unauthorized', details: 'No user found' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log('✅ User authenticated:', user.id);

    // Parse request body
    const { eventId, currentLevel } = await req.json();

    if (!eventId || !currentLevel) {
      console.error('❌ Missing required fields');
      return new Response(
        JSON.stringify({ error: 'Missing eventId or currentLevel' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log('🎮 Starting new round for event:', eventId, 'Level:', currentLevel);

    // 1. Get all confirmed participants for this event
    const { data: participants, error: participantsError } = await supabaseClient
      .from('event_participants')
      .select(`
        id,
        user_id,
        profiles:user_id (
          id,
          name
        )
      `)
      .eq('event_id', eventId)
      .eq('confirmed', true);

    if (participantsError) {
      console.error('❌ Error fetching participants:', participantsError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch participants' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!participants || participants.length === 0) {
      console.error('❌ No confirmed participants found');
      return new Response(
        JSON.stringify({ error: 'No confirmed participants found' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log('✅ Found', participants.length, 'confirmed participants');

    // 2. Select random participant
    const randomIndex = Math.floor(Math.random() * participants.length);
    const selectedParticipant = participants[randomIndex];
    const selectedUserId = selectedParticipant.user_id;
    const selectedUserName = (selectedParticipant.profiles as any)?.name || 'Participante';

    console.log('🎯 Selected participant:', selectedUserName, '(ID:', selectedUserId, ')');

    // 3. Select random question for the current level
    const questionsForLevel = QUESTIONS[currentLevel as keyof typeof QUESTIONS] || QUESTIONS.divertido;
    const randomQuestionIndex = Math.floor(Math.random() * questionsForLevel.length);
    const selectedQuestion = questionsForLevel[randomQuestionIndex];

    console.log('❓ Selected question:', selectedQuestion);

    // 4. CRITICAL FIX: First set game_phase to 'roulette' to show the spinning animation
    console.log('🎰 Setting game_phase to roulette...');
    const { error: rouletteError } = await supabaseClient
      .from('events')
      .update({
        game_phase: 'roulette',
        selected_participant_id: selectedUserId,
        selected_participant_name: selectedUserName,
        current_question: selectedQuestion,
        current_question_level: currentLevel,
      })
      .eq('id', eventId);

    if (rouletteError) {
      console.error('❌ Error setting roulette phase:', rouletteError);
      return new Response(
        JSON.stringify({ error: 'Failed to set roulette phase' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log('✅ Roulette phase set, waiting 6 seconds for animation...');

    // 5. Wait 6 seconds for the roulette animation to complete
    await new Promise(resolve => setTimeout(resolve, 6000));

    // 6. Now update to 'question' phase
    console.log('❓ Setting game_phase to question...');
    const { data: updatedEvent, error: updateError } = await supabaseClient
      .from('events')
      .update({
        game_phase: 'question',
        round_started_at: new Date().toISOString(),
      })
      .eq('id', eventId)
      .select()
      .single();

    if (updateError) {
      console.error('❌ Error updating to question phase:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to update to question phase' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log('✅ Question phase set successfully');

    // 7. Return the round data
    return new Response(
      JSON.stringify({
        success: true,
        selectedParticipantId: selectedUserId,
        selectedParticipantName: selectedUserName,
        question: selectedQuestion,
        questionLevel: currentLevel,
        projectRef: projectRef,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('❌ Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(error) }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
