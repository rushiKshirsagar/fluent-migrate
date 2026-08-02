import styled from 'styled-components';

export const Button = styled.button`
  background-color: #0f6cbd;
  color: white;
  border: 1px solid #115ea3;
  padding: 8px 12px;

  &:hover {
    background-color: #115ea3;
  }

  &:disabled {
    background-color: #f0f0f0;
    color: #bdbdbd;
  }
`;

export const Ghost = styled(Button)`
  background-color: transparent;
  color: ${(props) => props.theme.accent ?? '#0f6cbd'};
`;
