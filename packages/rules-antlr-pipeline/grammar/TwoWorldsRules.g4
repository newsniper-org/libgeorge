grammar TwoWorldsRules;

// ========== Parser ==========
program     : (stmt)* EOF ;
stmt        : ruleStmt | factStmt ;

ruleStmt    : head ':-' body '.' ;
factStmt    : atom '.' ;

// Heads
head        : emitHead | deriveHead ;
emitHead    : 'emit' '(' atom ',' expr ')' ;        // emit(atom, T)
deriveHead  : atom ;

// Bodies
body        : bodyItem (',' bodyItem)* ;

// Body items
bodyItem
    : negation
    | existsExpr
    | cardConstraint
    | forallConstraint
    | atom
    | cond
    ;

// not atom
negation    : 'not' atom ;

// exists( body )
existsExpr  : 'exists' '(' body ')' ;

// exact/at_least/at_most
cardConstraint
    : ('exact'|'at_least'|'at_most') '(' expr ',' '(' body ')' (',' 'by' '=' listIdent)? ')'
    ;

// forall(P, A -> B)  (A/B are bodies)
forallConstraint
    : 'forall' '(' IDENT ',' body '->' body ')'
    ;

// Conditions:
// 1) comparison: expr op expr
// 2) assignment sugar: IDENT '=' expr   (lowered later)
cond
    : expr ( '!=' | '==' | '>=' | '<=' | '>' | '<' ) expr
    | IDENT '=' expr
    ;

// Atom: predicate(args)
atom        : IDENT '(' (expr (',' expr)*)? ')' ;

// Expressions (precedence)
expr        : logicOr ;
logicOr     : logicAnd ( 'or' logicAnd )* ;
logicAnd    : equality ( 'and' equality )* ;
equality    : rel ( ('=='|'!=') rel )* ;
rel         : add ( ('>='|'<='|'>'|'<') add )* ;
add         : mul ( ('+'|'-') mul )* ;
mul         : unary ( ('*'|'/') unary )* ;
unary       : ('-'|'+') unary
            | primary
            ;

primary     : NUMBER
            | FLOAT
            | STRING
            | listExpr
            | callExpr
            | IDENT
            | '(' expr ')'
            ;

callExpr    : IDENT '(' (expr (',' expr)*)? ')' ;
listExpr    : '[' (IDENT (',' IDENT)*)? ']' ;
listIdent   : '[' (IDENT (',' IDENT)*)? ']' ;

// ========== Lexer ==========
IDENT       : [A-Za-z_][A-Za-z0-9_]* ;
NUMBER      : [0-9]+ ;
FLOAT       : [0-9]+ '.' [0-9]+ ;
STRING      : '"' ( '\\"' | ~["\\] )* '"' ;

WS          : [ \t\r\n]+ -> skip ;
COMMENT     : '%' ~[\r\n]* -> skip ;
