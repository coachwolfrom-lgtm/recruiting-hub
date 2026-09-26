function cloudApp() {
    return {
        // State
        activeTab: 'colleges',
        loading: false,
        errorMessage: '',
        
        // Data collections
        athletes: [],
        selectedAthleteId: null,
        divisions: [],
        interestLevels: [],
        allMajors: [],
        schools: [],
        logs: [],
        
        // Profile state
        profileItems: [],
        profileSocials: [],
        profileContacts: [],
        profileTournaments: [],
        profileMajorIds: [],

        // UI Filters & Modals
        searchQuery: '',
        selectedDivision: 'ALL',
        selectedInterest: 'ALL',
        selectedMajor: 'ALL',
        showAddSchoolModal: false,
        showEditSchoolModal: false,
        showAddLogModal: false,
        showEditLogModal: false,
        
        // Form models
        newSchool: { name: '', division: '', mascot: '', interest: 'Warm', notes: '' },
        editSchool: { id: null, name: '', division: '', mascot: '', interest: 'Warm', notes: '' },
        newLog: { school_id: '', date: new Date().toISOString().split('T')[0], type: 'Email', notes: '' },
        editLog: { id: null, school_id: '', date: '', type: 'Email', notes: '' },

        // Calendar state
        currentYear: new Date().getFullYear(),
        currentMonth: new Date().getMonth(), // 0-indexed

        async init() {
            await this.fetchAthletes();
            if (this.athletes.length > 0) {
                this.selectedAthleteId = this.athletes[0].id;
            }
            await this.fetchData();
        },

        async fetchAthletes() {
            // Adjust table name if your athletes table differs (e.g. 'athletes' or 'profiles')
            const { data, error } = await supabaseClient.from('athletes').select('*').order('first_name');
            if (data) {
                this.athletes = data;
            } else if (error) {
                // Fallback if table name is player or user
                this.athletes = [{ id: 1, first_name: 'Athlete' }];
                this.selectedAthleteId = 1;
            }
        },

        async switchAthlete(id) {
            this.selectedAthleteId = id;
            await this.fetchData();
        },

        async fetchData() {
            this.loading = true;
            this.errorMessage = '';

            const athId = this.selectedAthleteId;

            const { data: divisionsData } = await supabaseClient.from('divisions').select('*').order('name');
            if (divisionsData) this.divisions = divisionsData;

            const { data: interestData } = await supabaseClient.from('interest_levels').select('*').order('name');
            if (interestData) this.interestLevels = interestData;

            const { data: majorsData } = await supabaseClient.from('majors').select('*').order('name');
            if (majorsData) this.allMajors = majorsData;

            const { data: profileData } = await supabaseClient.from('player_profile').select('*').eq('athlete_id', athId).order('display_order');
            if (profileData) this.profileItems = profileData;

            const { data: socialsData } = await supabaseClient.from('player_profile_socials').select('*').eq('athlete_id', athId).order('display_order');
            if (socialsData) this.profileSocials = socialsData;

            const { data: contactsData } = await supabaseClient.from('player_profile_contacts').select('*').eq('athlete_id', athId).order('display_order');
            if (contactsData) this.profileContacts = contactsData;

            const { data: tournData } = await supabaseClient.from('player_profile_tournaments').select('*').eq('athlete_id', athId).order('display_order');
            if (tournData) this.profileTournaments = tournData;

            const { data: athMajors } = await supabaseClient.from('athlete_majors').select('major_id').eq('athlete_id', athId);
            if (athMajors) this.profileMajorIds = athMajors.map(am => am.major_id);

            // Fetch coaches separately
            const { data: coachesData } = await supabaseClient.from('coaches').select('*');

            // Fetch camps separately
            const { data: campsData } = await supabaseClient.from('camps').select('*');

            // Fetch schools and school_majors
            const { data: schoolsData, error: schoolsError } = await supabaseClient
                .from('schools')
                .select(`
                    id,
                    name,
                    division,
                    mascot,
                    interest,
                    school_majors (
                        major_id,
                        majors ( id, name )
                    )
                `)
                .order('name');

            if (schoolsError) {
                this.errorMessage = 'Database Error: ' + schoolsError.message;
            } else {
                this.schools = (schoolsData || []).map(s => {
                    const majorsList = s.school_majors ? s.school_majors.map(sm => sm.majors).filter(Boolean) : [];
                    const schoolCoaches = (coachesData || []).filter(c => c.school_id === s.id);
                    const schoolCamps = (campsData || []).filter(c => c.school_id === s.id);
                    return { 
                        ...s, 
                        majors: majorsList, 
                        coaches: schoolCoaches, 
                        camps: schoolCamps 
                    };
                });
            }

            const { data: logsData } = await supabaseClient.from('communication_logs').select('*').order('date', { ascending: false });
            if (logsData) this.logs = logsData;

            this.loading = false;
        },

        // Computed / Getters
        get currentAthlete() {
            return this.athletes.find(a => a.id === this.selectedAthleteId) || null;
        },

        get headerTitle() {
            if (!this.currentAthlete) return 'Recruiting Hub';
            return `${this.currentAthlete.first_name}'s Recruiting Hub`;
        },

        get filteredSchools() {
            return this.schools.filter(school => {
                const matchesSearch = school.name.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
                                      (school.mascot && school.mascot.toLowerCase().includes(this.searchQuery.toLowerCase()));
                const matchesDiv = this.selectedDivision === 'ALL' || school.division === this.selectedDivision;
                const matchesInt = this.selectedInterest === 'ALL' || school.interest === this.selectedInterest;
                const matchesMajor = this.selectedMajor === 'ALL' || (school.majors && school.majors.some(m => m.id == this.selectedMajor));
                return matchesSearch && matchesDiv && matchesInt && matchesMajor;
            });
        },

        get monthName() {
            const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
            return months[this.currentMonth];
        },

        get calendarDays() {
            const year = this.currentYear;
            const month = this.currentMonth;
            
            const firstDayIndex = new Date(year, month, 1).getDay();
            const totalDays = new Date(year, month + 1, 0).getDate();
            
            let days = [];
            
            // Padding for previous month
            for (let i = 0; i < firstDayIndex; i++) {
                days.push({ dayNum: '', dateStr: '', camps: [], inactive: true });
            }
            
            // Actual days of the month
            for (let d = 1; d <= totalDays; d++) {
                const formattedMonth = String(month + 1).padStart(2, '0');
                const formattedDay = String(d).padStart(2, '0');
                const dateStr = `${year}-${formattedMonth}-${formattedDay}`;
                
                days.push({
                    dayNum: d,
                    dateStr: dateStr,
                    camps: [],
                    inactive: false
                });
            }
            
            // Populate camps into correct days with date string normalization
            this.schools.forEach(s => {
                if (s.camps && s.camps.length > 0) {
                    s.camps.forEach(c => {
                        if (!c.camp_date) return;
                        let campDateStr = String(c.camp_date).split('T')[0];
                        days.forEach(day => {
                            if (day.dateStr === campDateStr) {
                                day.camps.push({ ...c, schoolName: s.name });
                            }
                        });
                    });
                }
            });
            
            return days;
        },

        prevMonth() {
            if (this.currentMonth === 0) {
                this.currentMonth = 11;
                this.currentYear--;
            } else {
                this.currentMonth--;
            }
        },

        nextMonth() {
            if (this.currentMonth === 11) {
                this.currentMonth = 0;
                this.currentYear++;
            } else {
                this.currentMonth++;
            }
        }
    };
}