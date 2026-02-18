; ZAX lowered .asm trace
; range: $0100..$014C (end exclusive)

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
ld HL, $0000                   ; 0127: 21 00 00
push HL                        ; 012A: E5
push AF                        ; 012B: F5
push BC                        ; 012C: C5
push DE                        ; 012D: D5
ld A, (sample_byte)            ; 012E: 3A 00 00
ld HL, $0017                   ; 0131: 21 17 00
push HL                        ; 0134: E5
call add_to_sample             ; 0135: CD 00 00
inc SP                         ; 0138: 33
inc SP                         ; 0139: 33
push DE                        ; 013A: D5
ex DE, HL                      ; 013B: EB
ld (IX - $0002), E             ; 013C: DD 73 FE
ld (IX - $0001), D             ; 013F: DD 72 FF
ex DE, HL                      ; 0142: EB
pop DE                         ; 0143: D1
__zax_epilogue_1:
pop DE                         ; 0144: D1
pop BC                         ; 0145: C1
pop AF                         ; 0146: F1
ld SP, IX                      ; 0147: DD F9
pop IX                         ; 0149: DD E1
ret                            ; 014B: C9
; func main end

; symbols:
; label add_to_sample = $0100
; label __zax_epilogue_0 = $0117
; label main = $011F
; label __zax_epilogue_1 = $0144
; var sample_byte = $014C
; var sample_word = $014D
