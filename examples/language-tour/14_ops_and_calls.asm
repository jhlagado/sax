; ZAX lowered .asm trace
; range: $0100..$014D (end exclusive)

; func add_to_sample begin
add_to_sample:
push IX                        ; 0100: DD E5
ld IX, $0000                   ; 0102: DD 21 00 00
add IX, SP                     ; 0106: DD 39
push AF                        ; 0108: F5
push BC                        ; 0109: C5
push DE                        ; 010A: D5
ld HL, (sample_word)           ; 010B: 2A 00 00
ld E, (IX + $0004)             ; 010E: DD 5E 04
ld D, (IX + $0005)             ; 0111: DD 56 05
xor A                          ; 0114: AF
adc HL, DE                     ; 0115: ED 5A
__zax_epilogue_0:
pop DE                         ; 0117: D1
pop BC                         ; 0118: C1
pop AF                         ; 0119: F1
ld SP, IX                      ; 011A: DD F9
pop IX                         ; 011C: DD E1
ret                            ; 011E: C9
; func add_to_sample end
; func main begin
main:
push IX                        ; 011F: DD E5
ld IX, $0000                   ; 0121: DD 21 00 00
add IX, SP                     ; 0125: DD 39
push HL                        ; 0127: E5
ld HL, $0000                   ; 0128: 21 00 00
ex (SP), HL                    ; 012B: E3
push AF                        ; 012C: F5
push BC                        ; 012D: C5
push DE                        ; 012E: D5
push HL                        ; 012F: E5
ld A, (sample_byte)            ; 0130: 3A 00 00
ld HL, $0017                   ; 0133: 21 17 00
push HL                        ; 0136: E5
call add_to_sample             ; 0137: CD 00 00
inc SP                         ; 013A: 33
inc SP                         ; 013B: 33
ex DE, HL                      ; 013C: EB
ld (IX - $0002), E             ; 013D: DD 73 FE
ld (IX - $0001), D             ; 0140: DD 72 FF
ex DE, HL                      ; 0143: EB
__zax_epilogue_1:
pop HL                         ; 0144: E1
pop DE                         ; 0145: D1
pop BC                         ; 0146: C1
pop AF                         ; 0147: F1
ld SP, IX                      ; 0148: DD F9
pop IX                         ; 014A: DD E1
ret                            ; 014C: C9
; func main end

; symbols:
; label add_to_sample = $0100
; label __zax_epilogue_0 = $0117
; label main = $011F
; label __zax_epilogue_1 = $0144
; var sample_byte = $014E
; var sample_word = $014F
