// app.js
document.addEventListener('alpine:init', () => {
    Alpine.data('cloudApp', () => ({
        // App State
        loading: true,
        errorMessage: '',
        toastMessage: '',
        activeTab: 'schools', // 'schools', 'profile', 'calendar', 'timeline'

        // Data Collections
        schools: [],
        divisions: [],
        allMajors: [],
        interestLevels: [],
        athletes: [],
        currentAthlete: null,
        selectedAthleteId: '',
        logs: [],
        tournaments: [],
        camps: [],

        // UI State (Modals)
        showSchoolModal: false,
        showLogModal: false,
        
        // Filters & Search
        search: '',
        divisionFilter: '',
        majorFilter: '',
        interestFilter: '',

        async init() {
            try {
                this.loading = true;
                // Initialize Supabase client
                window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
                await this.loadInitialData();
            } catch (err) {
                this.errorMessage = 'Initialization Error: ' + err.message;
                console.error(err);
            } finally {
                this.loading = false;
            }
        },

        async loadInitialData() {
            const [divRes, majRes, intRes, athRes] = await Promise.all([
                supabaseClient.from('divisions').select('*'),
                supabaseClient.from('majors').select('*'),
                supabaseClient.from('interest_levels').select('*'),
                supabaseClient.from('athletes').select('*').order('created_at', { ascending: true })
            ]);

            if (divRes.error) throw divRes.error;
            if (majRes.error) throw majRes.error;
            if (intRes.error) throw intRes.error;
            if (athRes.error) throw athRes.error;

            this.divisions = divRes.data || [];
            this.allMajors = majRes.data || [];
            this.interestLevels = intRes.data || [];
            this.athletes = athRes.data || [];

            if (this.athletes.length > 0) {
                this.currentAthlete = this.athletes[0];
                this.selectedAthleteId = this.currentAthlete.id;
                await this.loadRelationalData();
            }
        },

        async loadRelationalData() {
            if (!this.currentAthlete) return;
            this.loading = true;

            try {
                const [schoolRes, logRes, tournRes, campRes] = await Promise.all([
                    supabaseClient.from('schools').select('*, school_majors(major_id), coaches(*), camps(*)').eq('athlete_id', this.currentAthlete.id),
                    supabaseClient.from('communication_logs').select('*, schools(name)').eq('athlete_id', this.currentAthlete.id).order('log_date', { ascending: false }),
                    supabaseClient.from('tournaments').select('*').eq('athlete_id', this.currentAthlete.id).order('start_date', { ascending: true }),
                    supabaseClient.from('camps').select('*, schools(name)').eq('athlete_id', this.currentAthlete.id)
                ]);

                if (schoolRes.error) throw schoolRes.error;

                this.schools = (schoolRes.data || []).map(s => ({
                    ...s,
                    majors: s.school_majors ? s.school_majors.map(sm => this.allMajors.find(m => m.id === sm.major_id)).filter(Boolean) : []
                }));

                this.logs = (logRes.data || []).map(l => ({ ...l, schoolName: l.schools?.name }));
                this.tournaments = tournRes.data || [];
                this.camps = (campRes.data || []).map(c => ({ ...c, schoolName: c.schools?.name }));
            } catch (err) {
                this.errorMessage = 'Data Load Error: ' + err.message;
                console.error(err);
            } finally {
                this.loading = false;
            }
        },

        // Computed Properties
        get filteredSchools() {
            return this.schools.filter(school => {
                const matchesSearch = !this.search || 
                    school.name.toLowerCase().includes(this.search.toLowerCase()) ||
                    (school.mascot && school.mascot.toLowerCase().includes(this.search.toLowerCase()));
                
                const matchesDiv = !this.divisionFilter || school.division === this.divisionFilter;
                const matchesInterest = !this.interestFilter || school.interest === this.interestFilter;
                const matchesMajor = !this.majorFilter || (school.majors && school.majors.some(m => m.name === this.majorFilter));

                return matchesSearch && matchesDiv && matchesInterest && matchesMajor;
            });
        },

        // Actions
        async switchAthlete() {
            this.currentAthlete = this.athletes.find(a => a.id === this.selectedAthleteId);
            await this.loadRelationalData();
        },

        openSchoolModal() {
            this.showSchoolModal = true;
        },

        openLogModal() {
            this.showLogModal = true;
        },

        showToast(msg) {
            this.toastMessage = msg;
            setTimeout(() => { this.toastMessage = ''; }, 3000);
        }
    }));
});